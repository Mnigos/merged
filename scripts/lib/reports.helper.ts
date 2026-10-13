import type { IngestMetrics } from '@modules/ingest/application/ingest-metrics.helper'
import type { MergedDayReport } from '@modules/ingest/application/merge-day-parts.service'
import type { EnrichKindReport } from '@modules/profiles/application/enrich-kind.helper'
import type { EnrichReport } from '@modules/profiles/application/enrich.report'
import type { BuildSeasonReport } from '@modules/ranking/application/build-season.report'
import { Console, Effect } from 'effect'

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** Prints per-hour and day metrics of an ingested day. */
export const printIngestMetrics = (metrics: IngestMetrics) =>
	Effect.gen(function* () {
		yield* Console.table(
			metrics.hours.map(hour => ({
				hour: hour.hour,
				requests: hour.requests,
				downloaded: megabytes(hour.bytesDownloaded),
				lines: hour.linesSeen,
				preFiltered: hour.linesPreFiltered,
				decoded: hour.eventsDecoded,
				merges:
					hour.merges.merged + hour.merges.selfMerged + hour.merges.ownRepo,
				stars: hour.starEvents,
				time: seconds(hour.durationMs),
			}))
		)
		yield* Console.table({
			date: metrics.date,
			requests: metrics.requests,
			downloaded: megabytes(metrics.bytesDownloaded),
			linesSeen: metrics.linesSeen,
			linesPreFiltered: metrics.linesPreFiltered,
			eventsDecoded: metrics.eventsDecoded,
			invalidLines: metrics.invalidLines,
			ignoredEvents: metrics.ignoredEvents,
			botEvents: metrics.botEvents,
			mergedBySomeoneElse: metrics.merges.merged,
			selfMerged: metrics.merges.selfMerged,
			ownRepo: metrics.merges.ownRepo,
			mergesWithoutMerger: metrics.mergesWithoutMerger,
			starEvents: metrics.starEvents,
			contributionRows: metrics.contributionRows,
			repositories: metrics.repositories,
			output: metrics.output.location,
			outputSize: megabytes(metrics.output.bytes),
			wallTime: seconds(metrics.durationMs),
			peakRss: megabytes(metrics.peakRssBytes),
		})
	})

/** Prints the summary of a day merged from its parts. */
export const printMergedDay = (report: MergedDayReport) =>
	Console.table({
		date: report.date,
		parts: report.labels.join(', '),
		merged: report.totals.merged,
		selfMerged: report.totals.selfMerged,
		ownRepo: report.totals.ownRepo,
		stars: report.totals.stars,
		contributionRows: report.contributionRows,
		repositories: report.repositories,
		output: report.output.location,
		outputSize: megabytes(report.output.bytes),
	})

/** Prints the top 10 and the summary of a season build. */
export const printSeasonReport = (report: BuildSeasonReport) =>
	Effect.gen(function* () {
		yield* Console.table(report.top)
		yield* Console.table({
			season: report.season,
			published:
				report.published === 'all'
					? 'all files'
					: 'candidates only (no shards, boards or index)',
			status: report.status,
			daysIncluded: report.daysIncluded.length,
			missingDays: report.missingDays.join(', ') || 'none',
			contributors: report.contributors,
			excludedBots: report.excludedBots,
			withoutCountedRepository: report.withoutCountedRepository,
			repositories: report.repositories,
			mergedPullRequests: report.mergedPullRequests,
			candidateContributors: report.candidates.contributors,
			candidateRepositories: report.candidates.repositories,
			candidatePullRequests: report.candidates.pullRequests,
			filesWritten: report.filesWritten,
			written: megabytes(report.bytesWritten),
			wallTime: seconds(report.durationMs),
		})
	})

const toKindRow = (kind: EnrichKindReport) => ({
	requested: kind.requested,
	cached: kind.cached,
	fetched: kind.fetched,
	missing: kind.missing,
	failed: kind.failed,
	queries: kind.queries,
	cost: kind.cost,
	remaining: kind.remaining ?? '-',
	file: megabytes(kind.fileBytes),
})

/** Prints per-kind and total counts of an enrichment run. */
export const printEnrichReport = (report: EnrichReport) =>
	Effect.gen(function* () {
		yield* Console.table({
			repositories: toKindRow(report.repositories),
			contributors: toKindRow(report.contributors),
			pullRequests: toKindRow(report.pullRequests),
		})
		yield* Console.table({
			season: report.season,
			queries: report.queries,
			cost: report.cost,
			filesWritten: report.filesWritten,
			written: megabytes(report.bytesWritten),
			wallTime: seconds(report.durationMs),
		})
	})
