import type { IsoDate } from '@shared/schema/iso-date'
import { Config, Effect, Layer, Schedule, Stream } from 'effect'
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http'
import { ArchiveSourceError } from '../application/archive-source.error'
import { ArchiveSource } from '../application/archive-source.port'

/**
 * OpenDigger's mirror of the hourly GH Archive files, same file names. The
 * official feed (`https://data.gharchive.org`) has lost most events since 2026.
 */
export const DEFAULT_ARCHIVE_BASE_URL = 'https://gharchive.open-digger.cn'

/** Base URL of the hourly archive files, read from `ARCHIVE_BASE_URL`, the OpenDigger mirror by default; a trailing slash is dropped. */
export const archiveBaseUrlConfig = Config.URL('ARCHIVE_BASE_URL').pipe(
	Config.map(url => url.href.replace(/\/+$/u, '')),
	Config.withDefault(DEFAULT_ARCHIVE_BASE_URL)
)

/** Retries of a failed or transient request before the hour fails. */
export const REQUEST_RETRIES = 5

/** Times a body that broke off mid-download resumes from the last byte read (HTTP Range) before the hour fails. */
export const BODY_RESUMES = 5

/** URL of one archive hour; the hour has no leading zero. */
export const toArchiveHourUrl = (
	baseUrl: string,
	date: IsoDate,
	hour: number
) => `${baseUrl}/${date}-${hour}.json.gz`

const toMessage = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause)

const isNotFound = (cause: unknown) =>
	HttpClientError.isHttpClientError(cause) &&
	cause.reason._tag === 'StatusCodeError' &&
	cause.reason.response.status === 404

/** Message of a failed hour; a 404 means the archive has not published it yet. */
const getHourErrorMessage = (date: IsoDate, hour: number, cause: unknown) =>
	isNotFound(cause)
		? `GH Archive ${date} hour ${hour} is not published yet (404): the day is not complete in the archive yet`
		: `GH Archive ${date} hour ${hour}: ${toMessage(cause)}`

/**
 * Streams archive hours (300–450 MB gzipped each on the mirror) over HTTP: the
 * request is retried with exponential backoff, the body is gunzipped as it
 * arrives and split into lines, so an hour is never held in memory. A body
 * that breaks off after making progress resumes with a `Range` request from
 * the last byte read (`If-Range` on the first response's ETag, so a changed
 * file fails instead of splicing), at most `BODY_RESUMES` times; a 404 fails
 * the hour with a message that the day is not complete yet.
 */
export const ghArchiveHttpSourceLayer = Layer.effect(
	ArchiveSource,
	Effect.gen(function* () {
		const baseUrl = yield* archiveBaseUrlConfig
		const client = (yield* HttpClient.HttpClient).pipe(
			HttpClient.retryTransient({
				schedule: Schedule.exponential('1 second').pipe(Schedule.jittered),
				times: REQUEST_RETRIES,
			}),
			HttpClient.filterStatusOk
		)

		const readHour = (date: IsoDate, hour: number) => {
			const url = toArchiveHourUrl(baseUrl, date, hour)
			let bytesRead = 0
			let etag: string | undefined
			const toError = (cause: unknown) =>
				new ArchiveSourceError({
					date,
					hour,
					message: getHourErrorMessage(date, hour, cause),
				})

			const requestFrom = (offset: number) =>
				offset === 0
					? client.get(url).pipe(
							Effect.tap(({ headers: { etag: firstEtag } }) =>
								Effect.sync(() => {
									etag = firstEtag
								})
							)
						)
					: client
							.get(url, {
								headers: {
									range: `bytes=${offset}-`,
									...(etag ? { 'if-range': etag } : {}),
								},
							})
							.pipe(
								Effect.filterOrFail(
									response => response.status === 206,
									response =>
										new Error(
											`resume at byte ${offset} answered ${response.status}, not 206`
										)
								)
							)

			const bodyFrom = (
				offset: number,
				resumes: number
			): Stream.Stream<Uint8Array, unknown> =>
				HttpClientResponse.stream(requestFrom(offset)).pipe(
					Stream.tap(chunk =>
						Effect.sync(() => {
							bytesRead += chunk.byteLength
						})
					),
					Stream.catch(error =>
						bytesRead > offset && resumes < BODY_RESUMES
							? bodyFrom(bytesRead, resumes + 1)
							: Stream.fail(error)
					)
				)

			const compressed = bodyFrom(0, 0).pipe(
				Stream.map(chunk => new Uint8Array(chunk))
			)

			const lines = Stream.toReadableStreamEffect(compressed).pipe(
				Effect.map(body =>
					Stream.fromReadableStream({
						evaluate: () => body.pipeThrough(new DecompressionStream('gzip')),
						onError: toError,
					})
				),
				Stream.unwrap,
				Stream.decodeText,
				Stream.splitLines
			)

			return { lines, bytesRead: Effect.sync(() => bytesRead) }
		}

		return { readHour }
	})
)
