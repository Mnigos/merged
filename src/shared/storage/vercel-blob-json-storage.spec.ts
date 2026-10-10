import { describe, expect, it } from '@effect/vitest'
import type { PutCommandOptions } from '@vercel/blob'
import { ConfigProvider, Effect, Fiber, Layer, Option } from 'effect'
import {
	HttpClient,
	type HttpClientRequest,
	HttpClientResponse,
} from 'effect/http'
import { TestClock } from 'effect/testing'
import { JsonStorage } from './json-storage.port'
import {
	CACHE_CONTROL_MAX_AGE,
	makeVercelBlobJsonStorageLayer,
	type PutBlob,
	READ_RETRIES,
} from './vercel-blob-json-storage'

const BASE_URL = 'https://store.public.blob.vercel-storage.com'
const TOKEN = 'vercel_blob_rw_secret'
const path = 'days/2026-10-03.json'
const FULL_ENV = {
	BLOB_READ_WRITE_TOKEN: TOKEN,
	BLOB_BASE_URL: BASE_URL,
} as const satisfies Record<string, string>

interface ScriptedResponse {
	readonly status?: number
	readonly body?: string
}

interface PutCall {
	readonly pathname: string
	readonly body: string
	readonly options: PutCommandOptions
}

const uploadingTo =
	(calls: PutCall[]): PutBlob =>
	async (pathname, body, options) => {
		calls.push({ pathname, body, options })

		return { url: `${BASE_URL}/${pathname}` }
	}

const storageWith = (
	responses: readonly ScriptedResponse[],
	putBlob: PutBlob = uploadingTo([]),
	env: Readonly<Record<string, string>> = FULL_ENV
) => {
	const requests: HttpClientRequest.HttpClientRequest[] = []
	const client = HttpClient.make(request =>
		Effect.sync(() => {
			const { status = 200, body = '{}' } = responses[requests.length] ?? {}
			requests.push(request)

			return HttpClientResponse.fromWeb(
				request,
				new Response(status === 200 ? body : 'nope', { status })
			)
		})
	)
	const layer = makeVercelBlobJsonStorageLayer(putBlob).pipe(
		Layer.provide(
			Layer.mergeAll(
				Layer.succeed(HttpClient.HttpClient, client),
				ConfigProvider.layer(ConfigProvider.fromUnknown(env))
			)
		)
	)

	return { requests, layer }
}

describe('vercelBlobJsonStorageLayer', () => {
	it.effect('reads a file by its public URL without caches', () => {
		const { requests, layer } = storageWith([{ body: '{"ok":"żółw"}' }])

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.readText(path)).toEqual(
				Option.some('{"ok":"żółw"}')
			)
			expect(requests).toHaveLength(1)
			expect(requests[0]?.method).toBe('GET')
			expect(requests[0]?.url).toBe(`${BASE_URL}/${path}`)
			expect(requests[0]?.headers).toMatchObject({
				'cache-control': 'no-cache',
			})
		}).pipe(Effect.provide(layer))
	})

	it.effect('drops a trailing slash of the store URL', () => {
		const { requests, layer } = storageWith([{}], undefined, {
			BLOB_READ_WRITE_TOKEN: TOKEN,
			BLOB_BASE_URL: `${BASE_URL}/`,
		})

		return Effect.gen(function* () {
			yield* (yield* JsonStorage).readText(path)

			expect(requests[0]?.url).toBe(`${BASE_URL}/${path}`)
		}).pipe(Effect.provide(layer))
	})

	it.effect('reads without a token and fails writes that need one', () => {
		const calls: PutCall[] = []
		const { layer } = storageWith([{ body: '[1]' }], uploadingTo(calls), {
			BLOB_BASE_URL: BASE_URL,
		})

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.readText(path)).toEqual(Option.some('[1]'))
			const error = yield* Effect.flip(storage.writeText(path, '{}'))
			expect(error).toMatchObject({ _tag: 'StorageError', path })
			expect(error.message).toContain('BLOB_READ_WRITE_TOKEN')
			expect(calls).toHaveLength(0)
		}).pipe(Effect.provide(layer))
	})

	it.effect('reads a missing file as none without retrying', () => {
		const { requests, layer } = storageWith([{ status: 404 }])

		return Effect.gen(function* () {
			expect(yield* (yield* JsonStorage).readText(path)).toEqual(Option.none())
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('retries a 503 with backoff', () => {
		const { requests, layer } = storageWith([{ status: 503 }, { body: '[1]' }])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild((yield* JsonStorage).readText(path))
			yield* TestClock.adjust('799 millis')
			expect(requests).toHaveLength(1)
			yield* TestClock.adjust('1 minute')

			expect(yield* Fiber.join(fiber)).toEqual(Option.some('[1]'))
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect.each([500, 503])(
		'fails a %d with StorageError after the bounded number of retries',
		status => {
			const { requests, layer } = storageWith(
				Array.from({ length: READ_RETRIES + 1 }, () => ({ status }))
			)

			return Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(
					Effect.flip((yield* JsonStorage).readText(path))
				)
				yield* TestClock.adjust('10 minutes')

				expect(yield* Fiber.join(fiber)).toMatchObject({
					_tag: 'StorageError',
					path,
				})
				expect(requests).toHaveLength(READ_RETRIES + 1)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('fails a 403 with StorageError without retrying', () => {
		const { requests, layer } = storageWith([{ status: 403 }])

		return Effect.gen(function* () {
			expect(
				yield* Effect.flip((yield* JsonStorage).readText(path))
			).toMatchObject({ _tag: 'StorageError', path })
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('writes public JSON in place and returns its URL and size', () => {
		const calls: PutCall[] = []
		const { requests, layer } = storageWith([], uploadingTo(calls))

		return Effect.gen(function* () {
			expect(CACHE_CONTROL_MAX_AGE).toBe(60)
			expect(
				yield* (yield* JsonStorage).writeText(
					'seasons/2026-10/shards/0a.json',
					'{"ok":"żółw"}'
				)
			).toEqual({
				location: `${BASE_URL}/seasons/2026-10/shards/0a.json`,
				bytes: Buffer.byteLength('{"ok":"żółw"}'),
			})
			expect(calls).toHaveLength(1)
			expect(calls[0]).toMatchObject({
				pathname: 'seasons/2026-10/shards/0a.json',
				body: '{"ok":"żółw"}',
				options: {
					access: 'public',
					addRandomSuffix: false,
					allowOverwrite: true,
					contentType: 'application/json',
					cacheControlMaxAge: CACHE_CONTROL_MAX_AGE,
					token: TOKEN,
				},
			})
			expect(requests).toHaveLength(0)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails layer construction when BLOB_BASE_URL is missing', () => {
		const calls: PutCall[] = []
		const { requests, layer } = storageWith([], uploadingTo(calls), {
			BLOB_READ_WRITE_TOKEN: TOKEN,
		})

		return Effect.gen(function* () {
			const error = yield* Effect.flip(JsonStorage.pipe(Effect.provide(layer)))

			expect(error).toMatchObject({ _tag: 'ConfigError' })
			expect(error.message).toContain('BLOB_BASE_URL')
			expect(requests).toHaveLength(0)
			expect(calls).toHaveLength(0)
		})
	})

	it.effect('maps an upload failure to StorageError without the token', () => {
		const { layer } = storageWith([], async () => {
			throw new Error(`rejected token ${TOKEN}`)
		})

		return Effect.gen(function* () {
			const error = yield* Effect.flip(
				(yield* JsonStorage).writeText(path, '{}')
			)

			expect(error).toMatchObject({ _tag: 'StorageError', path })
			expect(error.message).not.toContain(TOKEN)
		}).pipe(Effect.provide(layer))
	})

	it.effect.each([
		'/etc/passwd',
		'../outside.json',
		'days/../outside.json',
		'days//x.json',
		'a/./b',
	])('rejects the path %j before any request', invalidPath => {
		const calls: PutCall[] = []
		const { requests, layer } = storageWith([], uploadingTo(calls))

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(
				yield* Effect.flip(storage.writeText(invalidPath, '{}'))
			).toMatchObject({ _tag: 'StorageError', path: invalidPath })
			expect(yield* Effect.flip(storage.readText(invalidPath))).toMatchObject({
				_tag: 'StorageError',
				path: invalidPath,
			})
			expect(calls).toHaveLength(0)
			expect(requests).toHaveLength(0)
		}).pipe(Effect.provide(layer))
	})
})
