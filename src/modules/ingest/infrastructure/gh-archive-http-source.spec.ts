import { gzipSync } from 'node:zlib'
import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, Fiber, Layer, Stream } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'
import { ArchiveSource } from '../application/archive-source.port'
import {
	ghArchiveHttpSourceLayer,
	REQUEST_RETRIES,
	toArchiveHourUrl,
} from './gh-archive-http-source'

const date = isoDateSchema.make('2026-10-03')
const body = gzipSync('{"type":"WatchEvent"}\n{"type":"PushEvent"}\n')

const sourceWith = (statuses: readonly number[]) => {
	const requests: string[] = []
	const client = HttpClient.make((request, url) =>
		Effect.sync(() => {
			const status = statuses[requests.length] ?? 200
			requests.push(url.toString())

			return HttpClientResponse.fromWeb(
				request,
				new Response(status === 200 ? body : null, { status })
			)
		})
	)
	const layer = ghArchiveHttpSourceLayer.pipe(
		Layer.provide(Layer.succeed(HttpClient.HttpClient, client))
	)

	return { requests, layer }
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
		expect(toArchiveHourUrl(date, 5)).toBe(
			'https://data.gharchive.org/2026-10-03-5.json.gz'
		)
	})
})

describe('ghArchiveHttpSourceLayer', () => {
	it.effect('gunzips the body into lines and counts compressed bytes', () => {
		const { requests, layer } = sourceWith([])

		return Effect.gen(function* () {
			expect(yield* readLines(15)).toEqual({
				lines: ['{"type":"WatchEvent"}', '{"type":"PushEvent"}'],
				bytesRead: body.byteLength,
			})
			expect(requests).toEqual([
				'https://data.gharchive.org/2026-10-03-15.json.gz',
			])
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails a missing hour without retrying', () => {
		const { requests, layer } = sourceWith([404])

		return Effect.gen(function* () {
			expect(yield* Effect.flip(readLines(3))).toMatchObject({
				_tag: 'ArchiveSourceError',
				date: '2026-10-03',
				hour: 3,
			})
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('retries transient responses with backoff', () => {
		const { requests, layer } = sourceWith([503, 503])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(readLines(0))
			yield* TestClock.adjust('1 minute')

			expect((yield* Fiber.join(fiber)).lines).toHaveLength(2)
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

			expect(yield* Fiber.join(fiber)).toMatchObject({
				_tag: 'ArchiveSourceError',
			})
			expect(requests).toHaveLength(REQUEST_RETRIES + 1)
		}).pipe(Effect.provide(layer))
	})
})
