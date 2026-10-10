import type { IsoDate } from '@shared/schema/iso-date'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { Effect, Layer, Option, Schema } from 'effect'
import { DayStoreError } from '../application/day-store.error'
import { DayStore } from '../application/day-store.port'
import {
	dailyAggregateSchema,
	type DailyAggregate,
} from '../domain/daily-aggregate'

const dailyAggregateJsonSchema = Schema.fromJsonString(dailyAggregateSchema)
const encodeDailyAggregateJson = Schema.encodeEffect(dailyAggregateJsonSchema)
const decodeDailyAggregateJson = Schema.decodeUnknownEffect(
	dailyAggregateJsonSchema
)

/** Storage path of a daily aggregate. */
export const toDayPath = (date: IsoDate) => `days/${date}.json`

const toError = (date: IsoDate) => (cause: { readonly message: string }) =>
	new DayStoreError({
		date,
		message: `Daily aggregate ${date}: ${cause.message}`,
	})

/** `DayStore` on `JsonStorage`: one JSON file per day at `days/<date>.json`. */
export const jsonDayStoreLayer = Layer.effect(
	DayStore,
	Effect.gen(function* () {
		const storage = yield* JsonStorage

		const write = Effect.fn('JsonDayStore.write')(function* (
			aggregate: DailyAggregate
		) {
			const json = yield* encodeDailyAggregateJson(aggregate).pipe(
				Effect.mapError(toError(aggregate.date))
			)

			return yield* storage
				.writeText(toDayPath(aggregate.date), json)
				.pipe(Effect.mapError(toError(aggregate.date)))
		})

		const read = Effect.fn('JsonDayStore.read')(function* (date: IsoDate) {
			const json = yield* storage
				.readText(toDayPath(date))
				.pipe(Effect.mapError(toError(date)))
			if (Option.isNone(json)) return Option.none<DailyAggregate>()

			return Option.some(
				yield* decodeDailyAggregateJson(json.value).pipe(
					Effect.mapError(toError(date))
				)
			)
		})

		return { write, read }
	})
)
