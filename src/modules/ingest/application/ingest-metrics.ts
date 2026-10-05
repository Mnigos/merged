import type { IsoDate } from '@shared/schema/iso-date'
import type { DailyAggregate } from '../domain/daily-aggregate'
import type { MergeKind } from '../domain/merge-event'
import type { StoredDay } from './day-store.port'
import type { HourScan } from './hour-scan'

export interface ScanCounts {
	readonly bytesDownloaded: number
	readonly linesSeen: number
	readonly linesPreFiltered: number
	readonly eventsDecoded: number
	readonly invalidLines: number
	readonly ignoredEvents: number
	readonly botEvents: number
	readonly merges: Readonly<Record<MergeKind, number>>
	readonly mergesWithoutMerger: number
	readonly starEvents: number
}

export interface HourMetrics extends ScanCounts {
	readonly hour: number
	readonly durationMs: number
}

export interface IngestMetrics extends ScanCounts {
	readonly date: IsoDate
	readonly hours: readonly HourMetrics[]
	readonly durationMs: number
	readonly peakRssBytes: number
	readonly contributionRows: number
	readonly repositories: number
	readonly output: StoredDay
}

interface HourMetricsInput {
	readonly hour: number
	readonly scan: HourScan
	readonly bytesDownloaded: number
	readonly durationMs: number
}

/** Metrics of one scanned hour. */
export function toHourMetrics({
	hour,
	scan,
	bytesDownloaded,
	durationMs,
}: HourMetricsInput): HourMetrics {
	const merges = { merged: 0, selfMerged: 0, ownRepo: 0 }
	for (const merge of scan.merges) merges[merge.mergeKind]++

	return {
		hour,
		durationMs,
		bytesDownloaded,
		linesSeen: scan.linesSeen,
		linesPreFiltered: scan.linesPreFiltered,
		eventsDecoded: scan.eventsDecoded,
		invalidLines: scan.invalidLines,
		ignoredEvents: scan.ignoredEvents,
		botEvents: scan.botEvents,
		merges,
		mergesWithoutMerger: scan.merges.filter(merge => !merge.mergedBy).length,
		starEvents: scan.stars.length,
	}
}

/** Sums the counts of every scanned hour. */
export const sumScanCounts = (hours: readonly ScanCounts[]): ScanCounts =>
	hours.reduce<ScanCounts>(
		(total, hour) => ({
			bytesDownloaded: total.bytesDownloaded + hour.bytesDownloaded,
			linesSeen: total.linesSeen + hour.linesSeen,
			linesPreFiltered: total.linesPreFiltered + hour.linesPreFiltered,
			eventsDecoded: total.eventsDecoded + hour.eventsDecoded,
			invalidLines: total.invalidLines + hour.invalidLines,
			ignoredEvents: total.ignoredEvents + hour.ignoredEvents,
			botEvents: total.botEvents + hour.botEvents,
			merges: {
				merged: total.merges.merged + hour.merges.merged,
				selfMerged: total.merges.selfMerged + hour.merges.selfMerged,
				ownRepo: total.merges.ownRepo + hour.merges.ownRepo,
			},
			mergesWithoutMerger: total.mergesWithoutMerger + hour.mergesWithoutMerger,
			starEvents: total.starEvents + hour.starEvents,
		}),
		{
			bytesDownloaded: 0,
			linesSeen: 0,
			linesPreFiltered: 0,
			eventsDecoded: 0,
			invalidLines: 0,
			ignoredEvents: 0,
			botEvents: 0,
			merges: { merged: 0, selfMerged: 0, ownRepo: 0 },
			mergesWithoutMerger: 0,
			starEvents: 0,
		}
	)

interface IngestMetricsInput {
	readonly date: IsoDate
	readonly hours: readonly HourMetrics[]
	readonly aggregate: DailyAggregate
	readonly output: StoredDay
	readonly durationMs: number
	readonly peakRssBytes: number
}

/** Day-level metrics: summed hour counts plus aggregate and output size. */
export const toIngestMetrics = ({
	aggregate,
	...input
}: IngestMetricsInput): IngestMetrics => ({
	...sumScanCounts(input.hours),
	...input,
	contributionRows: aggregate.contributions.length,
	repositories: aggregate.repositories.length,
})
