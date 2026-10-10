import type { GitHubLogin } from '@shared/schema/github-login'
import type { IsoDate } from '@shared/schema/iso-date'
import type { SeasonId } from '@shared/schema/season-id'
import type { StoredFile } from '@shared/storage/json-storage.port'
import type { Candidates } from '../domain/candidates'
import type { SeasonStatus } from '../domain/files/season-index-file'
import type { ScoredSeason } from '../domain/score-season'
import type { Season } from '../domain/season'

/** Contributors previewed in the report. */
export const REPORT_TOP = 10

export interface TopContributorPreview {
	readonly rank: number
	readonly login: GitHubLogin
	readonly score: number
	readonly mergedPullRequests: number
	readonly repositories: number
	readonly topRepository: string | undefined
}

/** What one `BuildSeason.run` computed and wrote. */
export interface BuildSeasonReport {
	readonly season: SeasonId
	readonly status: SeasonStatus
	readonly daysIncluded: readonly IsoDate[]
	readonly missingDays: readonly IsoDate[]
	readonly contributors: number
	readonly excludedBots: number
	/** Contributors kept at score 0 because none of their repositories counts yet. */
	readonly withoutCountedRepository: number
	readonly repositories: number
	readonly mergedPullRequests: number
	readonly candidates: {
		readonly contributors: number
		readonly repositories: number
		readonly pullRequests: number
	}
	readonly top: readonly TopContributorPreview[]
	readonly filesWritten: number
	readonly bytesWritten: number
	readonly durationMs: number
}

interface BuildSeasonReportInput {
	readonly season: Season
	readonly scored: ScoredSeason
	readonly candidates: Candidates
	readonly status: SeasonStatus
	readonly missingDays: readonly IsoDate[]
	readonly writes: readonly StoredFile[]
	readonly durationMs: number
}

/** Summarizes a season build for the script's output. */
export const toBuildSeasonReport = ({
	season,
	scored,
	candidates,
	status,
	missingDays,
	writes,
	durationMs,
}: BuildSeasonReportInput): BuildSeasonReport => ({
	season: season.seasonId,
	status,
	daysIncluded: season.daysIncluded,
	missingDays,
	contributors: scored.ranked.length,
	excludedBots: scored.excluded.filter(
		contributor => contributor.exclusion === 'bot'
	).length,
	withoutCountedRepository: scored.excluded.filter(
		contributor => contributor.exclusion === 'noCountedRepository'
	).length,
	repositories: season.repositories.size,
	mergedPullRequests: season.totals.merged + season.totals.selfMerged,
	candidates: {
		contributors: candidates.contributors.length,
		repositories: candidates.repositories.length,
		pullRequests: candidates.pullRequests.length,
	},
	top: scored.ranked.slice(0, REPORT_TOP).map(contributor => ({
		rank: contributor.rank,
		login: contributor.login,
		score: contributor.score,
		mergedPullRequests: contributor.merged + contributor.selfMerged,
		repositories: contributor.repositories.length,
		topRepository: contributor.repositories[0]?.repository,
	})),
	filesWritten: writes.length,
	bytesWritten: writes.reduce((total, write) => total + write.bytes, 0),
	durationMs,
})
