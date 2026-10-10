import type { SeasonId } from '@shared/schema/season-id'
import type { EnrichKindReport } from './enrich-kind'

/** What one `Enrich.run` fetched and wrote. */
export interface EnrichReport {
	readonly season: SeasonId
	readonly repositories: EnrichKindReport
	readonly contributors: EnrichKindReport
	readonly pullRequests: EnrichKindReport
	readonly queries: number
	readonly cost: number
	readonly filesWritten: number
	readonly bytesWritten: number
	readonly durationMs: number
}

interface EnrichReportInput {
	readonly season: SeasonId
	readonly repositories: EnrichKindReport
	readonly contributors: EnrichKindReport
	readonly pullRequests: EnrichKindReport
	readonly durationMs: number
}

/** Adds run totals to the per-kind reports. */
export function toEnrichReport(input: EnrichReportInput): EnrichReport {
	const kinds = [input.repositories, input.contributors, input.pullRequests]
	const sum = (pick: (kind: EnrichKindReport) => number) =>
		kinds.reduce((total, kind) => total + pick(kind), 0)

	return {
		...input,
		queries: sum(kind => kind.queries),
		cost: sum(kind => kind.cost),
		filesWritten: sum(kind => kind.writes),
		bytesWritten: sum(kind => kind.bytesWritten),
	}
}
