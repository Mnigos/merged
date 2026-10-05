import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, Layer, Option } from 'effect'
import hourZero from '../testing/fixtures/archive-hour-0.jsonl?raw'
import hourOne from '../testing/fixtures/archive-hour-1.jsonl?raw'
import { inMemoryArchiveSourceLayer } from '../testing/in-memory-archive-source'
import { inMemoryDayStoreLayer } from '../testing/in-memory-day-store'
import { DayStore } from './day-store.port'
import { IngestDay } from './ingest-day.service'

const date = isoDateSchema.make('2026-10-03')

const testLayer = IngestDay.layer.pipe(
	Layer.provideMerge(
		Layer.mergeAll(
			inMemoryArchiveSourceLayer(
				new Map([
					[0, hourZero],
					[1, hourOne],
				])
			),
			inMemoryDayStoreLayer
		)
	)
)

const expectedAggregate = {
	date,
	totals: { merged: 5, selfMerged: 1, ownRepo: 1, stars: 4 },
	contributions: [
		{
			author: 'carol',
			repository: 'acme/gadgets',
			merged: 1,
			selfMerged: 0,
			mergedPullRequests: [5],
		},
		{
			author: 'gus',
			repository: 'acme/gadgets',
			merged: 1,
			selfMerged: 0,
			mergedPullRequests: [11],
		},
		{
			author: 'alice',
			repository: 'acme/widgets',
			merged: 3,
			selfMerged: 0,
			mergedPullRequests: [1, 2, 10],
		},
		{
			author: 'bob',
			repository: 'acme/widgets',
			merged: 0,
			selfMerged: 1,
			mergedPullRequests: [],
		},
	],
	ownRepoMerges: { alice: 1 },
	repositories: [
		{ repository: 'acme/gadgets', stars: 1, mergeAuthors: 2 },
		{ repository: 'acme/widgets', stars: 2, mergeAuthors: 2 },
		{ repository: 'lonely/repo', stars: 1, mergeAuthors: 0 },
	],
}

describe('IngestDay', () => {
	it.layer(testLayer)(layerIt => {
		layerIt.effect('aggregates every hour and writes the day', () =>
			Effect.gen(function* () {
				const ingestDay = yield* IngestDay
				const store = yield* DayStore

				yield* ingestDay.ingest(date, { hours: [0, 1] })

				expect(Option.getOrThrow(yield* store.read(date))).toEqual(
					expectedAggregate
				)
			})
		)

		layerIt.effect('reports line, event and merge counts', () =>
			Effect.gen(function* () {
				const ingestDay = yield* IngestDay

				expect(
					yield* ingestDay.ingest(date, { hours: [0, 1], concurrency: 2 })
				).toMatchObject({
					date,
					bytesDownloaded:
						Buffer.byteLength(hourZero) + Buffer.byteLength(hourOne),
					linesSeen: 28,
					linesPreFiltered: 9,
					eventsDecoded: 17,
					invalidLines: 2,
					ignoredEvents: 4,
					botEvents: 2,
					merges: { merged: 5, selfMerged: 1, ownRepo: 1 },
					mergesWithoutMerger: 5,
					starEvents: 4,
					contributionRows: 4,
					repositories: 3,
					output: { location: 'memory://days/2026-10-03.json' },
				})
			})
		)

		layerIt.effect('reports metrics per hour in hour order', () =>
			Effect.gen(function* () {
				const ingestDay = yield* IngestDay
				const metrics = yield* ingestDay.ingest(date, {
					hours: [0, 1],
					concurrency: 2,
				})

				expect(metrics.hours).toMatchObject([
					{ hour: 0, linesSeen: 20, linesPreFiltered: 5, starEvents: 2 },
					{ hour: 1, linesSeen: 8, linesPreFiltered: 4, starEvents: 2 },
				])
				expect(metrics.peakRssBytes).toBeGreaterThan(0)
			})
		)

		layerIt.effect('produces the same aggregate at any concurrency', () =>
			Effect.gen(function* () {
				const ingestDay = yield* IngestDay
				const store = yield* DayStore

				yield* ingestDay.ingest(date, { hours: [1, 0], concurrency: 1 })

				expect(Option.getOrThrow(yield* store.read(date))).toEqual(
					expectedAggregate
				)
			})
		)

		layerIt.effect(
			'matches sequential output when concurrency exceeds the deduplicated hours',
			() =>
				Effect.gen(function* () {
					const ingestDay = yield* IngestDay
					const store = yield* DayStore
					yield* ingestDay.ingest(date, { hours: [0, 1], concurrency: 1 })
					const sequential = Option.getOrThrow(yield* store.read(date))
					const concurrent = yield* ingestDay.ingest(date, {
						hours: [1, 0, 1, 0],
						concurrency: 8,
					})

					expect(sequential).toEqual(expectedAggregate)
					expect(Option.getOrThrow(yield* store.read(date))).toEqual(sequential)
					expect(concurrent.hours.map(hour => hour.hour)).toEqual([0, 1])
					expect(concurrent.linesSeen).toBe(28)
					expect(concurrent.bytesDownloaded).toBe(
						Buffer.byteLength(hourZero) + Buffer.byteLength(hourOne)
					)
				})
		)

		layerIt.effect(
			'fails with ArchiveSourceError when an hour is missing',
			() =>
				Effect.gen(function* () {
					const ingestDay = yield* IngestDay

					expect(
						yield* Effect.flip(ingestDay.ingest(date, { hours: [0, 5] }))
					).toMatchObject({ _tag: 'ArchiveSourceError', hour: 5 })
				})
		)
	})

	it.effect(
		'matches the sequential aggregate with all events in a single hour',
		() =>
			Effect.gen(function* () {
				const ingestDay = yield* IngestDay
				const store = yield* DayStore
				yield* ingestDay.ingest(date, { hours: [0], concurrency: 1 })
				const sequential = Option.getOrThrow(yield* store.read(date))
				const concurrent = yield* ingestDay.ingest(date, {
					hours: [0],
					concurrency: 8,
				})

				expect(sequential).toEqual(expectedAggregate)
				expect(Option.getOrThrow(yield* store.read(date))).toEqual(sequential)
				expect(concurrent.hours.map(hour => hour.hour)).toEqual([0])
				expect(concurrent.linesSeen).toBe(28)
			}).pipe(
				Effect.provide(
					IngestDay.layer.pipe(
						Layer.provideMerge(
							Layer.mergeAll(
								inMemoryArchiveSourceLayer(new Map([[0, hourZero + hourOne]])),
								inMemoryDayStoreLayer
							)
						)
					)
				)
			)
	)
})
