import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer, Option } from 'effect'
import type { DailyAggregate } from '../domain/daily-aggregate'
import { jsonDayPartStoreLayer } from '../infrastructure/json-day-part-store'
import { jsonDayStoreLayer } from '../infrastructure/json-day-store'
import hourZero from '../testing/fixtures/archive-hour-0.jsonl?raw'
import hourOne from '../testing/fixtures/archive-hour-1.jsonl?raw'
import { inMemoryArchiveIngestSourceLayer } from '../testing/in-memory-archive-source'
import { DayPartStore } from './day-part-store.port'
import { DayStore } from './day-store.port'
import { IngestDay } from './ingest-day.service'
import { MergeDayParts } from './merge-day-parts.service'

const date = isoDateSchema.make('2026-10-03')

const part = (stars: number, partDate = date): DailyAggregate => ({
	date: partDate,
	totals: { merged: 1, selfMerged: 0, ownRepo: 0, stars },
	contributions: [
		{
			author: githubLoginSchema.make('alice'),
			repository: 'acme/widgets',
			merged: 1,
			selfMerged: 0,
			mergedPullRequests: [stars],
		},
	],
	ownRepoMerges: {},
	repositories: [{ repository: 'acme/widgets', stars, mergeAuthors: 1 }],
})

const storesOver = (files: Map<string, string>) =>
	Layer.mergeAll(jsonDayPartStoreLayer, jsonDayStoreLayer).pipe(
		Layer.provide(inMemoryJsonStorageLayer(files))
	)

const mergeLayerOver = (files: Map<string, string>) =>
	MergeDayParts.layer.pipe(Layer.provideMerge(storesOver(files)))

describe('MergeDayParts', () => {
	it.effect('merges the named parts and writes the day file', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			const partStore = yield* DayPartStore
			yield* partStore.write(part(2), '0-11')
			yield* partStore.write(part(3), '12-23')

			const report = yield* (yield* MergeDayParts).run({
				date,
				labels: ['0-11', '12-23'],
			})

			expect(report).toMatchObject({
				date,
				labels: ['0-11', '12-23'],
				totals: { merged: 2, selfMerged: 0, ownRepo: 0, stars: 5 },
				contributionRows: 1,
				repositories: 1,
				output: { location: 'memory://days/2026-10-03.json' },
			})
			expect(report.output.bytes).toBe(
				Buffer.byteLength(files.get('days/2026-10-03.json') ?? '')
			)
			expect(Option.getOrThrow(yield* (yield* DayStore).read(date))).toEqual({
				...part(5),
				totals: { merged: 2, selfMerged: 0, ownRepo: 0, stars: 5 },
				contributions: [
					{
						author: 'alice',
						repository: 'acme/widgets',
						merged: 2,
						selfMerged: 0,
						mergedPullRequests: [2, 3],
					},
				],
			})
			expect([...files.keys()].toSorted()).toEqual([
				'days/2026-10-03.json',
				'days/2026-10-03.part-0-11.json',
				'days/2026-10-03.part-12-23.json',
			])
		}).pipe(Effect.provide(mergeLayerOver(files)))
	})

	it.effect(
		'writes the same day as one ingest of every hour when each hour is a part',
		() =>
			Effect.gen(function* () {
				const ingestDay = yield* IngestDay
				const wholeDay = isoDateSchema.make('2026-10-04')
				yield* ingestDay.ingest(date, { hours: [0], part: '0' })
				yield* ingestDay.ingest(date, { hours: [1], part: '1' })
				yield* ingestDay.ingest(wholeDay, { hours: [0, 1] })

				yield* (yield* MergeDayParts).run({ date, labels: ['0', '1'] })

				const dayStore = yield* DayStore
				expect(Option.getOrThrow(yield* dayStore.read(date))).toEqual({
					...Option.getOrThrow(yield* dayStore.read(wholeDay)),
					date,
				})
			}).pipe(
				Effect.provide(
					Layer.mergeAll(IngestDay.layer, MergeDayParts.layer).pipe(
						Layer.provideMerge(
							Layer.mergeAll(
								inMemoryArchiveIngestSourceLayer(
									new Map([
										[0, hourZero],
										[1, hourOne],
									])
								),
								storesOver(new Map())
							)
						)
					)
				)
			)
	)

	it.effect('fails naming a missing part and writes no day file', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			yield* (yield* DayPartStore).write(part(2), '0-11')

			const error = yield* Effect.flip(
				(yield* MergeDayParts).run({ date, labels: ['0-11', '12-23'] })
			)

			expect(error).toMatchObject({
				_tag: 'MissingDayPartError',
				date,
				label: '12-23',
			})
			expect(files.has('days/2026-10-03.json')).toBe(false)
		}).pipe(Effect.provide(mergeLayerOver(files)))
	})

	it.effect('fails when a part file holds another day', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			const partStore = yield* DayPartStore
			yield* partStore.write(part(2, isoDateSchema.make('2026-10-04')), '0-23')
			const misplaced = files.get('days/2026-10-04.part-0-23.json')
			if (misplaced !== undefined)
				files.set('days/2026-10-03.part-0-23.json', misplaced)

			const error = yield* Effect.flip(
				(yield* MergeDayParts).run({ date, labels: ['0-23'] })
			)

			expect(error).toMatchObject({
				_tag: 'DailyAggregateMergeError',
				dates: ['2026-10-03', '2026-10-04'],
			})
			expect(files.has('days/2026-10-03.json')).toBe(false)
		}).pipe(Effect.provide(mergeLayerOver(files)))
	})

	it.effect('fails without labels', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				(yield* MergeDayParts).run({ date, labels: [] })
			)

			expect(error).toMatchObject({ _tag: 'DailyAggregateMergeError' })
		}).pipe(Effect.provide(mergeLayerOver(new Map())))
	)
})
