import type { IsoDate } from '@shared/schema/iso-date'
import { Context, Duration, Effect, Layer, Stream } from 'effect'
import { aggregateDay } from '../domain/daily-aggregate'
import type { ArchiveSourceError } from './archive-source.error'
import { ArchiveSource } from './archive-source.port'
import type { DayStoreError } from './day-store.error'
import { DayStore } from './day-store.port'
import { emptyHourScan, scanLine } from './hour-scan'
import {
	toHourMetrics,
	toIngestMetrics,
	type IngestMetrics,
} from './ingest-metrics'

/** Every hour of a UTC day, as GH Archive numbers them. */
export const ALL_HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** GH Archive hours streamed at the same time. */
export const DEFAULT_CONCURRENCY = 4

export interface IngestDayOptions {
	readonly hours?: readonly number[]
	readonly concurrency?: number
}

export interface IngestDayShape {
	readonly ingest: (
		date: IsoDate,
		options?: IngestDayOptions
	) => Effect.Effect<IngestMetrics, ArchiveSourceError | DayStoreError>
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
			const source = yield* ArchiveSource
			const store = yield* DayStore

			const scanHour = Effect.fn('IngestDay.scanHour')(function* (
				date: IsoDate,
				hour: number
			) {
				const archiveHour = source.readHour(date, hour)
				const [duration, scan] = yield* Effect.timed(
					Stream.runFold(archiveHour.lines, emptyHourScan, scanLine)
				)
				const metrics = toHourMetrics({
					hour,
					scan,
					bytesDownloaded: yield* archiveHour.bytesRead,
					durationMs: Duration.toMillis(duration),
				})
				yield* Effect.logInfo('hour ingested').pipe(
					Effect.annotateLogs({
						hour,
						lines: metrics.linesSeen,
						merges: scan.merges.length,
						ms: metrics.durationMs,
					})
				)

				return { metrics, merges: scan.merges, stars: scan.stars }
			})

			const ingest = Effect.fn('IngestDay.ingest')(function* (
				date: IsoDate,
				{
					hours = ALL_HOURS,
					concurrency = DEFAULT_CONCURRENCY,
				}: IngestDayOptions = {}
			) {
				const [duration, { scans, aggregate, output }] = yield* Effect.timed(
					Effect.gen(function* () {
						const hourScans = yield* Effect.forEach(
							toUniqueHours(hours),
							hour => scanHour(date, hour),
							{ concurrency }
						)
						const dayAggregate = aggregateDay({
							date,
							merges: hourScans.flatMap(scan => scan.merges),
							stars: hourScans.flatMap(scan => scan.stars),
						})

						return {
							scans: hourScans,
							aggregate: dayAggregate,
							output: yield* store.write(dayAggregate),
						}
					})
				)

				return toIngestMetrics({
					date,
					hours: scans.map(scan => scan.metrics),
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
