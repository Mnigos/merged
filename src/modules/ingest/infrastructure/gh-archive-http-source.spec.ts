import { gzipSync } from 'node:zlib'
import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { ConfigProvider, Effect, Fiber, Layer, Stream } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'
import { ArchiveSourceError } from '../application/archive-source.error'
import { ArchiveSource } from '../application/archive-source.port'
import {
	BODY_RESUMES,
	DEFAULT_ARCHIVE_BASE_URL,
	ghArchiveHttpSourceLayer,
	REQUEST_RETRIES,
	toArchiveHourUrl,
} from './gh-archive-http-source'

const date = isoDateSchema.make('2026-10-03')
const body = gzipSync('{"type":"WatchEvent"}\n{"type":"PushEvent"}\n')
const hourUrl = (hour: number) =>
	toArchiveHourUrl(DEFAULT_ARCHIVE_BASE_URL, date, hour)

interface RecordedRequest {
	readonly url: string
	readonly headers: Readonly<Record<string, string>>
}

type Reply = number | ((request: RecordedRequest) => Response)

/** A body that sends the first `length` bytes of `bytes`, then breaks off. */
const brokenBody = (bytes: Uint8Array, length: number) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes.subarray(0, length))
		},
		pull(controller) {
			controller.error(new Error('connection reset'))
		},
	})

/** The rest of `body` from the requested `Range` start, as a 206. */
const partialReply = ({ headers }: RecordedRequest) =>
	new Response(
		body.subarray(Number(/bytes=(\d+)-/u.exec(headers.range ?? '')?.[1])),
		{
			status: 206,
		}
	)

const sourceWith = (
	replies: readonly Reply[],
	env: Record<string, string> = {}
) => {
	const requests: RecordedRequest[] = []
	const client = HttpClient.make((request, url) =>
		Effect.sync(() => {
			const reply = replies[requests.length] ?? 200
			const recorded = { url: url.toString(), headers: request.headers }
			requests.push(recorded)

			return HttpClientResponse.fromWeb(
				request,
				typeof reply === 'function'
					? reply(recorded)
					: new Response(reply === 200 ? body : null, {
							status: reply,
							headers: { etag: '"v1"' },
						})
			)
		})
	)
	const layer = ghArchiveHttpSourceLayer.pipe(
		Layer.provide(
			Layer.mergeAll(
				Layer.succeed(HttpClient.HttpClient, client),
				ConfigProvider.layer(ConfigProvider.fromUnknown(env))
			)
		)
	)

	return { requests, urls: () => requests.map(request => request.url), layer }
}

const readLines = (hour: number) =>
	Effect.gen(function* () {
		const source = yield* ArchiveSource
		const archiveHour = source.readHour(date, hour)
		const lines = yield* Stream.runCollect(archiveHour.lines)

		return { lines, bytesRead: yield* archiveHour.bytesRead }
	})

describe('toArchiveHourUrl', () => {
	it('builds the hour without a leading zero', () => {
		expect(toArchiveHourUrl('https://archive.test', date, 5)).toBe(
			'https://archive.test/2026-10-03-5.json.gz'
		)
	})
})

describe('ghArchiveHttpSourceLayer', () => {
	it.effect('gunzips the body into lines and counts compressed bytes', () => {
		const { urls, layer } = sourceWith([])

		return Effect.gen(function* () {
			expect(yield* readLines(15)).toEqual({
				lines: ['{"type":"WatchEvent"}', '{"type":"PushEvent"}'],
				bytesRead: body.byteLength,
			})
			expect(urls()).toEqual([
				'https://gharchive.open-digger.cn/2026-10-03-15.json.gz',
			])
		}).pipe(Effect.provide(layer))
	})

	it.effect('reads from ARCHIVE_BASE_URL when it is set', () => {
		const { urls, layer } = sourceWith([], {
			ARCHIVE_BASE_URL: 'https://data.gharchive.org/',
		})

		return Effect.gen(function* () {
			yield* readLines(7)
			expect(urls()).toEqual([
				'https://data.gharchive.org/2026-10-03-7.json.gz',
			])
		}).pipe(Effect.provide(layer))
	})

	it.effect('resumes a broken body from the last byte read', () => {
		const { requests, layer } = sourceWith([
			() => new Response(brokenBody(body, 10), { headers: { etag: '"v1"' } }),
			partialReply,
		])

		return Effect.gen(function* () {
			expect(yield* readLines(1)).toEqual({
				lines: ['{"type":"WatchEvent"}', '{"type":"PushEvent"}'],
				bytesRead: body.byteLength,
			})
			expect(
				requests.map(({ headers }) => [headers.range, headers['if-range']])
			).toEqual([
				[undefined, undefined],
				['bytes=10-', '"v1"'],
			])
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails when a resume is answered with the whole file', () => {
		const { requests, layer } = sourceWith([
			() => new Response(brokenBody(body, 10)),
			200,
		])

		return Effect.gen(function* () {
			const error = yield* Effect.flip(readLines(1))
			expect(error).toBeInstanceOf(ArchiveSourceError)
			expect(error.message).toContain('not 206')
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect('gives up after the bounded number of resumes', () => {
		const { requests, layer } = sourceWith(
			Array.from(
				{ length: BODY_RESUMES + 1 },
				(_, attempt) => () =>
					new Response(brokenBody(body.subarray(attempt * 2), 2), {
						status: attempt === 0 ? 200 : 206,
					})
			)
		)

		return Effect.gen(function* () {
			const error = yield* Effect.flip(readLines(1))
			expect(error).toBeInstanceOf(ArchiveSourceError)
			expect(error.message).toContain('2026-10-03 hour 1')
			expect(requests).toHaveLength(BODY_RESUMES + 1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails a missing hour without retrying', () => {
		const { urls, layer } = sourceWith([404])

		return Effect.gen(function* () {
			const error = yield* Effect.flip(readLines(3))
			expect(error).toBeInstanceOf(ArchiveSourceError)
			expect(error).toMatchObject({
				_tag: 'ArchiveSourceError',
				date: '2026-10-03',
				hour: 3,
			})
			expect(error.message).toContain('2026-10-03 hour 3')
			expect(error.message).toContain('not complete in the archive yet')
			expect(urls()).toEqual([hourUrl(3)])
		}).pipe(Effect.provide(layer))
	})

	it.effect('succeeds after exactly one retry of a 500 response', () => {
		const { urls, layer } = sourceWith([500, 200])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(readLines(4))
			yield* TestClock.adjust('1 minute')

			expect(yield* Fiber.join(fiber)).toEqual({
				lines: ['{"type":"WatchEvent"}', '{"type":"PushEvent"}'],
				bytesRead: body.byteLength,
			})
			expect(urls()).toEqual([hourUrl(4), hourUrl(4)])
		}).pipe(Effect.provide(layer))
	})

	it.effect('retries transient responses with backoff', () => {
		const { requests, layer } = sourceWith([503, 503])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(readLines(0))
			yield* TestClock.adjust('1 minute')

			expect(yield* Fiber.join(fiber)).toEqual({
				lines: ['{"type":"WatchEvent"}', '{"type":"PushEvent"}'],
				bytesRead: body.byteLength,
			})
			expect(requests).toHaveLength(3)
		}).pipe(Effect.provide(layer))
	})

	it.effect('gives up after the bounded number of retries', () => {
		const { requests, layer } = sourceWith(
			Array.from({ length: REQUEST_RETRIES + 1 }, () => 503)
		)

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(Effect.flip(readLines(0)))
			yield* TestClock.adjust('10 minutes')

			const error = yield* Fiber.join(fiber)
			expect(error).toBeInstanceOf(ArchiveSourceError)
			expect(error).toMatchObject({
				_tag: 'ArchiveSourceError',
				date,
				hour: 0,
			})
			expect(error.message).not.toContain('not complete')
			expect(requests).toHaveLength(REQUEST_RETRIES + 1)
		}).pipe(Effect.provide(layer))
	})
})
