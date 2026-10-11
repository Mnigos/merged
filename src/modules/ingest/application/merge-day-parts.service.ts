import type { IsoDate } from '@shared/schema/iso-date'
import { Context, Effect, Layer, Option } from 'effect'
import {
	mergeDailyAggregates,
	type DailyAggregate,
	type DayTotals,
} from '../domain/daily-aggregate'
import { DailyAggregateMergeError } from '../domain/daily-aggregate.error'
import { DayPartStore } from './day-part-store.port'
import type { DayStoreError } from './day-store.error'
import { DayStore, type StoredDay } from './day-store.port'
import { MissingDayPartError } from './missing-day-part.error'

export interface MergeDayPartsInput {
	readonly date: IsoDate
	readonly labels: readonly string[]
}

/** What `MergeDayParts.run` wrote. */
export interface MergedDayReport {
	readonly date: IsoDate
	readonly labels: readonly string[]
	readonly totals: DayTotals
	readonly contributionRows: number
	readonly repositories: number
	readonly output: StoredDay
}

export interface MergeDayPartsShape {
	readonly run: (
		input: MergeDayPartsInput
	) => Effect.Effect<
		MergedDayReport,
		DayStoreError | MissingDayPartError | DailyAggregateMergeError
	>
}

/** Reads a day's parts, merges them, and writes the day file. */
export class MergeDayParts extends Context.Service<
	MergeDayParts,
	MergeDayPartsShape
>()('ingest/MergeDayParts') {
	static readonly layer = Layer.effect(
		MergeDayParts,
		Effect.gen(function* () {
			const partStore = yield* DayPartStore
			const dayStore = yield* DayStore

			const readPart = Effect.fn('MergeDayParts.readPart')(function* (
				date: IsoDate,
				label: string
			) {
				const part = yield* partStore.read(date, label)
				if (Option.isSome(part)) return part.value

				return yield* Effect.fail(
					new MissingDayPartError({
						date,
						label,
						message: `Day part ${date} ${label} is missing`,
					})
				)
			})

			const run = Effect.fn('MergeDayParts.run')(function* ({
				date,
				labels,
			}: MergeDayPartsInput) {
				const parts: DailyAggregate[] = []
				for (const label of labels) parts.push(yield* readPart(date, label))
				const aggregate = yield* Effect.fromResult(mergeDailyAggregates(parts))
				if (aggregate.date !== date)
					return yield* Effect.fail(
						new DailyAggregateMergeError({
							dates: [date, aggregate.date],
							message: `Day parts of ${date} hold ${aggregate.date}`,
						})
					)

				return {
					date,
					labels,
					totals: aggregate.totals,
					contributionRows: aggregate.contributions.length,
					repositories: aggregate.repositories.length,
					output: yield* dayStore.write(aggregate),
				}
			})

			return { run }
		})
	)
}
