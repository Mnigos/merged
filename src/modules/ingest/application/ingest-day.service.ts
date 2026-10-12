import type { IsoDate } from '@shared/schema/iso-date'
import { Context, Duration, Effect, Layer } from 'effect'
import { aggregateDay } from '../domain/daily-aggregate'
import type { ArchiveSourceError } from './archive-source.error'
import { DayPartStore } from './day-part-store.port'
import type { DayStoreError } from './day-store.error'
import { DayStore } from './day-store.port'
import {
	toHourMetrics,
	toIngestMetrics,
	type IngestMetrics,
} from './ingest-metrics'
import { IngestSource } from './ingest-source.port'
import type { SearchSourceError } from './search-source.error'

/** Every hour of a UTC day, as GH Archive numbers them. */
export const ALL_HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/**
 * Hours read at the same time. On the OpenDigger mirror (300–650 MB per hour)
 * four hours ran a full day in 5.4 min at 1.1 GB peak RSS on a laptop; one
 * stream alone reaches about 12 MB/s, so fewer would be slower. The search
 * source caps its queries in flight on its own.
 */
export const DEFAULT_CONCURRENCY = 4

export interface IngestDayOptions {
	readonly hours?: readonly number[]
	readonly concurrency?: number
	/** Writes the aggregate as the day part with this label instead of the day file. */
	readonly part?: string
}

export interface IngestDayShape {
	readonly ingest: (
		date: IsoDate,
		options?: IngestDayOptions
	) => Effect.Effect<
		IngestMetrics,
		ArchiveSourceError | SearchSourceError | DayStoreError
	>
}

/** Each hour once, in ascending order, so a repeated hour is not counted twice. */
const toUniqueHours = (hours: readonly number[]) =>
	[...new Set(hours)].toSorted((left, right) => left - right)

const readPeakRssBytes = Effect.sync(
	() => process.resourceUsage().maxRSS * 1024
)

export class IngestDay extends Context.Service<IngestDay, IngestDayShape>()(
	'ingest/IngestDay'
) {
	static readonly layer = Layer.effect(
		IngestDay,
		Effect.gen(function* () {
			const source = yield* IngestSource
			const store = yield* DayStore
			const partStore = yield* DayPartStore

			const readHour = Effect.fn('IngestDay.readHour')(function* (
				date: IsoDate,
				hour: number
			) {
				const [duration, events] = yield* Effect.timed(
					source.readHour(date, hour)
				)
				const metrics = toHourMetrics({
					hour,
					events,
					durationMs: Duration.toMillis(duration),
				})
				yield* Effect.logInfo('hour ingested').pipe(
					Effect.annotateLogs({
						hour,
						requests: metrics.requests,
						lines: metrics.linesSeen,
						merges: events.merges.length,
						ms: metrics.durationMs,
					})
				)

				return { metrics, merges: events.merges, stars: events.stars }
			})

			const ingest = Effect.fn('IngestDay.ingest')(function* (
				date: IsoDate,
				{
					hours = ALL_HOURS,
					concurrency = DEFAULT_CONCURRENCY,
					part,
				}: IngestDayOptions = {}
			) {
				const [duration, { results, aggregate, output }] = yield* Effect.timed(
					Effect.gen(function* () {
						const hourResults = yield* Effect.forEach(
							toUniqueHours(hours),
							hour => readHour(date, hour),
							{ concurrency }
						)
						const dayAggregate = aggregateDay({
							date,
							merges: hourResults.flatMap(result => result.merges),
							stars: hourResults.flatMap(result => result.stars),
						})

						return {
							results: hourResults,
							aggregate: dayAggregate,
							output: yield* part === undefined
								? store.write(dayAggregate)
								: partStore.write(dayAggregate, part),
						}
					})
				)

				return toIngestMetrics({
					date,
					hours: results.map(result => result.metrics),
					aggregate,
					output,
					durationMs: Duration.toMillis(duration),
					peakRssBytes: yield* readPeakRssBytes,
				})
			})

			return { ingest }
		})
	)
}
