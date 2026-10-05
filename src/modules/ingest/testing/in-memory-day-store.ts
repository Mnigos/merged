import type { IsoDate } from '@shared/schema/iso-date'
import { Effect, Layer, Option } from 'effect'
import { DayStore } from '../application/day-store.port'
import type { DailyAggregate } from '../domain/daily-aggregate'

/** Test `DayStore` that keeps daily aggregates in a map for the layer's lifetime. */
export const inMemoryDayStoreLayer = Layer.sync(DayStore, () => {
	const days = new Map<IsoDate, DailyAggregate>()

	return {
		write: (aggregate: DailyAggregate) =>
			Effect.sync(() => {
				days.set(aggregate.date, aggregate)

				return {
					location: `memory://days/${aggregate.date}.json`,
					bytes: JSON.stringify(aggregate).length,
				}
			}),
		read: (date: IsoDate) =>
			Effect.sync(() => Option.fromNullishOr(days.get(date))),
	}
})
