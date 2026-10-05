import type { IsoDate } from '@shared/schema/iso-date'
import { Effect, Layer, Schedule, Stream } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import { ArchiveSourceError } from '../application/archive-source.error'
import { ArchiveSource } from '../application/archive-source.port'

/** Base URL of the hourly GH Archive files. */
export const GH_ARCHIVE_URL = 'https://data.gharchive.org'

/** Retries of a failed or transient request before the hour fails. */
export const REQUEST_RETRIES = 5

/** URL of one GH Archive hour; the hour has no leading zero. */
export const toArchiveHourUrl = (date: IsoDate, hour: number) =>
	`${GH_ARCHIVE_URL}/${date}-${hour}.json.gz`

const toMessage = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause)

/**
 * Streams GH Archive hours over HTTP: the request is retried with exponential
 * backoff, the body is gunzipped as it arrives and split into lines, so an hour
 * is never held in memory. Failures after the body started are not retried.
 */
export const ghArchiveHttpSourceLayer = Layer.effect(
	ArchiveSource,
	Effect.gen(function* () {
		const client = (yield* HttpClient.HttpClient).pipe(
			HttpClient.retryTransient({
				schedule: Schedule.exponential('1 second').pipe(Schedule.jittered),
				times: REQUEST_RETRIES,
			}),
			HttpClient.filterStatusOk
		)

		const readHour = (date: IsoDate, hour: number) => {
			let bytesRead = 0
			const toError = (cause: unknown) =>
				new ArchiveSourceError({
					date,
					hour,
					message: `GH Archive ${date} hour ${hour}: ${toMessage(cause)}`,
				})

			const compressed = HttpClientResponse.stream(
				client.get(toArchiveHourUrl(date, hour))
			).pipe(
				Stream.tap(chunk =>
					Effect.sync(() => {
						bytesRead += chunk.byteLength
					})
				),
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
