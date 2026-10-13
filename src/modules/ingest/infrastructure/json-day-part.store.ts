import type { IsoDate } from '@shared/schema/iso-date.schema'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { Effect, Layer, Option } from 'effect'
import { DayPartStore } from '../application/day-part-store.port'
import { DayStoreError } from '../application/day-store.error'
import type { DailyAggregate } from '../domain/daily-aggregate.model'
import {
	decodeDailyAggregateJson,
	encodeDailyAggregateJson,
} from './daily-aggregate-json.helper'

/** Storage path of a day part, next to the day file. */
export const toDayPartPath = (date: IsoDate, label: string) =>
	`days/${date}.part-${label}.json`

const toError =
	(date: IsoDate, label: string) => (cause: { readonly message: string }) =>
		new DayStoreError({
			date,
			message: `Day part ${date} ${label}: ${cause.message}`,
		})

/** `DayPartStore` on `JsonStorage`: one JSON file per part at `days/<date>.part-<label>.json`. */
export const jsonDayPartStoreLayer = Layer.effect(
	DayPartStore,
	Effect.gen(function* () {
		const storage = yield* JsonStorage

		const write = Effect.fn('JsonDayPartStore.write')(function* (
			aggregate: DailyAggregate,
			label: string
		) {
			const json = yield* encodeDailyAggregateJson(aggregate).pipe(
				Effect.mapError(toError(aggregate.date, label))
			)

			return yield* storage
				.writeText(toDayPartPath(aggregate.date, label), json)
				.pipe(Effect.mapError(toError(aggregate.date, label)))
		})

		const read = Effect.fn('JsonDayPartStore.read')(function* (
			date: IsoDate,
			label: string
		) {
			const json = yield* storage
				.readText(toDayPartPath(date, label))
				.pipe(Effect.mapError(toError(date, label)))
			if (Option.isNone(json)) return Option.none<DailyAggregate>()

			return Option.some(
				yield* decodeDailyAggregateJson(json.value).pipe(
					Effect.mapError(toError(date, label))
				)
			)
		})

		return { write, read }
	})
)
