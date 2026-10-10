import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, Layer, Option } from 'effect'
import { inMemoryDayStoreLayer } from '../testing/in-memory-day-store'
import { DailyAggregates } from './daily-aggregates.service'
import { DayStore } from './day-store.port'

const date = isoDateSchema.make('2026-10-03')
const aggregate = {
	date,
	totals: { merged: 0, selfMerged: 0, ownRepo: 0, stars: 0 },
	contributions: [],
	ownRepoMerges: {},
	repositories: [],
}

describe('DailyAggregates', () => {
	it.layer(
		DailyAggregates.layer.pipe(Layer.provideMerge(inMemoryDayStoreLayer))
	)(layerIt => {
		layerIt.effect('reads an ingested day and none for a missing one', () =>
			Effect.gen(function* () {
				const store = yield* DayStore
				const dailyAggregates = yield* DailyAggregates
				yield* store.write(aggregate)

				expect(yield* dailyAggregates.read(date)).toEqual(
					Option.some(aggregate)
				)
				expect(
					yield* dailyAggregates.read(isoDateSchema.make('2026-10-04'))
				).toEqual(Option.none())
			})
		)
	})
})
