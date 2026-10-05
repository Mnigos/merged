import { gzipSync } from 'node:zlib'
import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import { vi } from 'vitest'
import { DayStore } from '../application/day-store.port'
import { IngestDay } from '../application/ingest-day.service'
import type { DailyAggregate } from '../domain/daily-aggregate'
import { inMemoryDayStoreLayer } from '../testing/in-memory-day-store'
import { ghArchiveHttpSourceLayer } from './gh-archive-http-source'

const date = isoDateSchema.make('2026-10-03')
const expectedAggregate = {
	date,
	totals: { merged: 1, selfMerged: 0, ownRepo: 0, stars: 0 },
	contributions: [
		{
			author: githubLoginSchema.make('alice'),
			repository: 'acme/widgets',
			merged: 1,
			selfMerged: 0,
			mergedPullRequests: [7],
		},
	],
	ownRepoMerges: {},
	repositories: [{ repository: 'acme/widgets', stars: 0, mergeAuthors: 1 }],
} as const satisfies DailyAggregate

function mergeLine(number: number, padding = '') {
	return JSON.stringify({
		type: 'PullRequestEvent',
		actor: { login: 'Alice' },
		repo: { id: 101, name: 'Acme/Widgets' },
		created_at: '2026-10-03T00:00:00Z',
		payload: { action: 'merged', number, padding },
	})
}

function ingestText(text: string, chunkSize = 128) {
	const compressed = gzipSync(text, { level: 0 })
	const client = HttpClient.make(request =>
		Effect.sync(() =>
			HttpClientResponse.fromWeb(
				request,
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							for (
								let offset = 0;
								offset < compressed.length;
								offset += chunkSize
							)
								controller.enqueue(
									compressed.subarray(offset, offset + chunkSize)
								)
							controller.close()
						},
					})
				)
			)
		)
	)
	const sourceLayer = ghArchiveHttpSourceLayer.pipe(
		Layer.provide(Layer.succeed(HttpClient.HttpClient, client))
	)

	return Effect.gen(function* () {
		const ingestDay = yield* IngestDay
		const store = yield* DayStore
		const metrics = yield* ingestDay.ingest(date, { hours: [0] })
		expect(metrics.bytesDownloaded).toBe(compressed.byteLength)

		return { metrics, aggregate: Option.getOrThrow(yield* store.read(date)) }
	}).pipe(
		Effect.provide(
			IngestDay.layer.pipe(
				Layer.provideMerge(Layer.mergeAll(sourceLayer, inMemoryDayStoreLayer))
			)
		)
	)
}

describe('GH Archive streaming into IngestDay', () => {
	it.effect(
		'decodes one JSON event split across actual decompressed chunks',
		() =>
			Effect.gen(function* () {
				const chunks: Uint8Array[] = []
				const nativeDecompressionStream = globalThis.DecompressionStream
				const decompressionSpy = vi
					.spyOn(globalThis, 'DecompressionStream')
					.mockImplementation(
						class extends nativeDecompressionStream {
							constructor(format: CompressionFormat) {
								super(format)
								Object.defineProperty(this, 'readable', {
									value: this.readable.pipeThrough(
										new TransformStream<Uint8Array, Uint8Array>({
											transform(chunk, controller) {
												chunks.push(chunk)
												controller.enqueue(chunk)
											},
										})
									),
								})
							}
						}
					)
				try {
					const line = mergeLine(7, 'x'.repeat(32 * 1024))
					const { aggregate, metrics } = yield* ingestText(`${line}\n`, 1024)

					expect(chunks.length).toBeGreaterThan(1)
					expect(new TextDecoder().decode(Buffer.concat(chunks))).toBe(
						`${line}\n`
					)
					const firstChunk = new TextDecoder().decode(chunks[0])
					expect(firstChunk.length).toBeGreaterThan(0)
					expect(firstChunk.length).toBeLessThan(line.length)
					expect(firstChunk).toBe(line.slice(0, firstChunk.length))
					expect(aggregate).toEqual(expectedAggregate)
					expect(metrics).toMatchObject({
						linesSeen: 1,
						eventsDecoded: 1,
						invalidLines: 0,
					})
				} finally {
					decompressionSpy.mockRestore()
				}
			})
	)

	it.effect('processes a final JSON line without a trailing newline', () =>
		Effect.gen(function* () {
			const { aggregate, metrics } = yield* ingestText(mergeLine(7))

			expect(aggregate).toEqual(expectedAggregate)
			expect(metrics).toMatchObject({
				linesSeen: 1,
				eventsDecoded: 1,
				invalidLines: 0,
			})
		})
	)

	it.effect(
		'processes CRLF lines without stray carriage returns or empty events',
		() =>
			Effect.gen(function* () {
				const { aggregate, metrics } = yield* ingestText(
					`${mergeLine(7)}\r\n${mergeLine(9)}\r\n`
				)

				expect(aggregate).toEqual({
					...expectedAggregate,
					totals: { merged: 2, selfMerged: 0, ownRepo: 0, stars: 0 },
					contributions: [
						{
							author: 'alice',
							repository: 'acme/widgets',
							merged: 2,
							selfMerged: 0,
							mergedPullRequests: [7, 9],
						},
					],
				})
				expect(metrics).toMatchObject({
					linesSeen: 2,
					eventsDecoded: 2,
					invalidLines: 0,
					linesPreFiltered: 0,
				})
			})
	)

	it.effect(
		'ignores empty lines between events without counting invalid JSON',
		() =>
			Effect.gen(function* () {
				const { aggregate, metrics } = yield* ingestText(
					`${mergeLine(7)}\n\n\n${mergeLine(9)}\n`
				)

				expect(aggregate).toEqual({
					...expectedAggregate,
					totals: { merged: 2, selfMerged: 0, ownRepo: 0, stars: 0 },
					contributions: [
						{
							author: 'alice',
							repository: 'acme/widgets',
							merged: 2,
							selfMerged: 0,
							mergedPullRequests: [7, 9],
						},
					],
				})
				expect(metrics).toMatchObject({
					linesSeen: 4,
					eventsDecoded: 2,
					invalidLines: 0,
					linesPreFiltered: 2,
				})
			})
	)

	it.effect(
		'processes a 300 KiB JSON line without truncation or duplicate events',
		() =>
			Effect.gen(function* () {
				const line = mergeLine(7, 'x'.repeat(300 * 1024 - mergeLine(7).length))
				expect(Buffer.byteLength(line)).toBe(300 * 1024)
				const { aggregate, metrics } = yield* ingestText(`${line}\n`, 4096)

				expect(aggregate).toEqual(expectedAggregate)
				expect(metrics).toMatchObject({
					linesSeen: 1,
					eventsDecoded: 1,
					invalidLines: 0,
					linesPreFiltered: 0,
				})
			})
	)
})
