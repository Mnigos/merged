import type { IsoDate } from '@shared/schema/iso-date'
import { Context, Effect, Layer, type Option } from 'effect'
import type { DailyAggregate } from '../domain/daily-aggregate'
import type { DayStoreError } from './day-store.error'
import { DayStore } from './day-store.port'

export interface DailyAggregatesShape {
	readonly read: (
		date: IsoDate
	) => Effect.Effect<Option.Option<DailyAggregate>, DayStoreError>
}

/** Ingest's read side for other modules: the daily aggregate of a day, if ingested. */
export class DailyAggregates extends Context.Service<
	DailyAggregates,
	DailyAggregatesShape
>()('ingest/DailyAggregates') {
	static readonly layer = Layer.effect(
		DailyAggregates,
		Effect.gen(function* () {
			const store = yield* DayStore

			const read = Effect.fn('DailyAggregates.read')(function* (date: IsoDate) {
				return yield* store.read(date)
			})

			return { read }
		})
	)
}
