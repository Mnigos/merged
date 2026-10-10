import {
	blobBaseUrlConfig,
	blobReadWriteTokenConfig,
} from '@shared/config/blob'
import { put, type PutBlobResult, type PutCommandOptions } from '@vercel/blob'
import {
	ConfigProvider,
	Effect,
	Layer,
	Option,
	Redacted,
	Schedule,
} from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import { JsonStorage } from './json-storage.port'
import { toStorageSegments } from './storage-path'
import { StorageError } from './storage.error'

/** Retries of a Blob read that failed with a 5xx, 408, 429 or a network error. */
export const READ_RETRIES = 3

/** Seconds the Blob CDN and browsers may cache a file, the minimum Vercel Blob allows. */
export const CACHE_CONTROL_MAX_AGE = 60

/** The `@vercel/blob` `put` call, replaceable in specs. */
export type PutBlob = (
	pathname: string,
	body: string,
	options: PutCommandOptions
) => Promise<Pick<PutBlobResult, 'url'>>

const toMessage = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause)

const toError = (path: string, secret?: string) => (cause: unknown) => {
	const message = toMessage(cause)

	return new StorageError({
		path,
		message: `${path}: ${secret ? message.replaceAll(secret, '[redacted]') : message}`,
	})
}

const toPathname = (path: string) =>
	Effect.fromResult(toStorageSegments(path)).pipe(
		Effect.map(segments => segments.join('/'))
	)

/**
 * `JsonStorage` on Vercel Blob for the layer below; `putBlob` uploads, so
 * specs never reach the network.
 */
export const makeVercelBlobJsonStorageLayer = (putBlob: PutBlob) =>
	Layer.effect(
		JsonStorage,
		Effect.gen(function* () {
			const configProvider = yield* ConfigProvider.ConfigProvider
			const baseUrl = yield* blobBaseUrlConfig
			const client = (yield* HttpClient.HttpClient).pipe(
				HttpClient.retryTransient({
					schedule: Schedule.exponential('1 second').pipe(Schedule.jittered),
					times: READ_RETRIES,
				})
			)

			const readText = Effect.fn('VercelBlobJsonStorage.readText')(function* (
				path: string
			) {
				const pathname = yield* toPathname(path)
				const response = yield* client
					.execute(
						HttpClientRequest.get(`${baseUrl}/${pathname}`).pipe(
							HttpClientRequest.setHeader('cache-control', 'no-cache')
						)
					)
					.pipe(Effect.mapError(toError(path)))
				if (response.status === 404) return Option.none<string>()
				if (response.status < 200 || response.status >= 300)
					return yield* Effect.fail(
						toError(path)(`Vercel Blob responded ${response.status}`)
					)

				return Option.some(
					yield* response.text.pipe(Effect.mapError(toError(path)))
				)
			})

			const writeText = Effect.fn('VercelBlobJsonStorage.writeText')(function* (
				path: string,
				text: string
			) {
				const pathname = yield* toPathname(path)
				const token = yield* blobReadWriteTokenConfig
					.parse(configProvider)
					.pipe(
						Effect.mapError(() =>
							toError(path)(
								'BLOB_READ_WRITE_TOKEN is not set; Blob writes need it'
							)
						)
					)
				const secret = Redacted.value(token)
				const { url } = yield* Effect.tryPromise({
					try: async abortSignal =>
						await putBlob(pathname, text, {
							access: 'public',
							addRandomSuffix: false,
							allowOverwrite: true,
							contentType: 'application/json',
							cacheControlMaxAge: CACHE_CONTROL_MAX_AGE,
							token: secret,
							abortSignal,
						}),
					catch: toError(path, secret),
				})

				return { location: url, bytes: Buffer.byteLength(text) }
			})

			return { readText, writeText }
		})
	)

/**
 * `JsonStorage` on Vercel Blob. Files are public JSON under `BLOB_BASE_URL`,
 * written in place with `BLOB_READ_WRITE_TOKEN` (read at the first write, so
 * a read-only website needs only `BLOB_BASE_URL`) and cached for
 * `CACHE_CONTROL_MAX_AGE` seconds. Reads fetch the public URL with
 * `cache-control: no-cache` instead of SDK `head` calls; a 404 is a missing
 * file; 5xx, 408, 429 and network errors are retried `READ_RETRIES` times
 * with backoff. The CDN can still serve an overwritten file's previous version
 * for up to a minute, so reads do not guarantee read-after-write; the pipeline
 * relies on `writeThroughJsonStorageLayer` in one process for that.
 * Error messages never carry the token. Needs an `HttpClient`.
 */
export const vercelBlobJsonStorageLayer = makeVercelBlobJsonStorageLayer(put)
