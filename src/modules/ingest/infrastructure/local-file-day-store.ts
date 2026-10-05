import type { IsoDate } from '@shared/schema/iso-date'
import { Effect, FileSystem, Layer, Option, Path, Schema } from 'effect'
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

const toError = (date: IsoDate) => (cause: { readonly message: string }) =>
	new DayStoreError({
		date,
		message: `Daily aggregate ${date}: ${cause.message}`,
	})

/**
 * Stores daily aggregates as `<directory>/days/<date>.json` on the local disk,
 * the same layout the Vercel Blob store will use.
 */
export const localFileDayStoreLayer = (directory: string) =>
	Layer.effect(
		DayStore,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const daysDirectory = path.join(directory, 'days')
			const toFilePath = (date: IsoDate) =>
				path.join(daysDirectory, `${date}.json`)
			const write = Effect.fn('LocalFileDayStore.write')(function* (
				aggregate: DailyAggregate
			) {
				const location = toFilePath(aggregate.date)
				const json = yield* encodeDailyAggregateJson(aggregate).pipe(
					Effect.mapError(toError(aggregate.date))
				)
				yield* fs
					.makeDirectory(daysDirectory, { recursive: true })
					.pipe(
						Effect.andThen(fs.writeFileString(location, json)),
						Effect.mapError(toError(aggregate.date))
					)

				return { location, bytes: Buffer.byteLength(json) }
			})

			const read = Effect.fn('LocalFileDayStore.read')(function* (
				date: IsoDate
			) {
				const location = toFilePath(date)
				const exists = yield* fs
					.exists(location)
					.pipe(Effect.mapError(toError(date)))
				if (!exists) return Option.none<DailyAggregate>()

				const json = yield* fs
					.readFileString(location)
					.pipe(Effect.mapError(toError(date)))

				return Option.some(
					yield* decodeDailyAggregateJson(json).pipe(
						Effect.mapError(toError(date))
					)
				)
			})

			return { write, read }
		})
	)
