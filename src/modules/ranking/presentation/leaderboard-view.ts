import type { SeasonId } from '@shared/schema/season-id'
import type {
	BoardFile,
	BoardRow,
	ContributorBoardId,
	RepositoryBoardFile,
} from '../domain/files/board-file'
import type {
	SeasonIndex,
	SeasonIndexEntry,
	SeasonStatus,
} from '../domain/files/season-index-file'
import type { ShardEntry } from '../domain/files/shard-file'
import { lastDayIncluded } from '../domain/season-index'

/** A season as the pages show it. */
export interface SeasonView {
	readonly id: string
	readonly status: SeasonStatus
	readonly daysIncluded: number
	readonly daysInMonth: number
	/** Last UTC day with a daily aggregate, `YYYY-MM-DD`. */
	readonly lastDayIncluded: string | null
	readonly computedAt: string
	readonly contributors: number
	readonly repositories: number
	readonly mergedPullRequests: number
	/** Logins excluded as bots; `null` for indexes written before it was recorded. */
	readonly excludedBots: number | null
}

export interface ContributorRowView {
	readonly rank: number
	readonly login: string
	readonly name: string | null
	readonly location: string | null
	readonly score: number
	/** Merged pull requests, self-merged included. */
	readonly mergedPullRequests: number
	readonly topRepository: string | null
	/** Repositories besides the top one. */
	readonly otherRepositories: number
}

export interface BoardView {
	readonly id: ContributorBoardId
	/** Contributors ranked on the board, not only the rows. */
	readonly contributors: number
	readonly rows: readonly ContributorRowView[]
	/** Rows in the board file, up to 100. */
	readonly availableRows: number
}

export interface BoardResult {
	readonly season: SeasonView
	readonly board: BoardView
}

export interface RepositoryRowView {
	readonly rank: number
	readonly repository: string
	readonly language: string | null
	readonly contributors: number
	readonly mergedPullRequests: number
	readonly stars: number | null
}

export interface RepositoryBoardResult {
	readonly season: SeasonView
	readonly rows: readonly RepositoryRowView[]
	readonly availableRows: number
}

export interface RepositoryLineView {
	readonly repository: string
	/** Merged pull requests, self-merged included. */
	readonly mergedPullRequests: number
	readonly score: number
	readonly counted: boolean
}

export interface ContributorView {
	readonly login: string
	readonly name: string | null
	readonly location: string | null
	readonly rank: number | null
	readonly polandRank: number | null
	readonly percentile: number | null
	readonly score: number
	/** Merged pull requests, self-merged included. */
	readonly mergedPullRequests: number
	readonly selfMergedPullRequests: number
	/** Counted repositories first, then by score. */
	readonly repositories: readonly RepositoryLineView[]
}

export type ContributorOutcome =
	| {
			readonly state: 'ranked' | 'noCountedRepository' | 'bot'
			readonly contributor: ContributorView
	  }
	| { readonly state: 'notFound'; readonly login: string }

export interface ContributorResult {
	readonly season: SeasonView
	/** Absolute URL of the result page, for sharing. */
	readonly url: string
	readonly outcome: ContributorOutcome
}

/** The season to show: the requested one, or the newest when none is requested. */
export function findSeason(index: SeasonIndex, seasonId?: SeasonId) {
	const id = seasonId ?? index.latest

	return index.seasons.find(season => season.id === id)
}

export const toSeasonView = (entry: SeasonIndexEntry): SeasonView => ({
	id: entry.id,
	status: entry.status,
	daysIncluded: entry.daysIncluded,
	daysInMonth: entry.daysInMonth,
	lastDayIncluded: lastDayIncluded(entry) ?? null,
	computedAt: entry.computedAt,
	contributors: entry.contributors,
	repositories: entry.repositories,
	mergedPullRequests: entry.mergedPullRequests,
	excludedBots: entry.excludedBots ?? null,
})

const toContributorRowView = (row: BoardRow): ContributorRowView => ({
	rank: row.rank,
	login: row.login,
	name: row.name,
	location: row.location,
	score: row.score,
	mergedPullRequests: row.mergedPullRequests + row.selfMergedPullRequests,
	topRepository: row.topRepositories[0]?.repository ?? null,
	otherRepositories: Math.max(0, row.repositories - 1),
})

export const toBoardView = (file: BoardFile, rows: number): BoardView => ({
	id: file.board,
	contributors: file.contributors,
	rows: file.rows.slice(0, rows).map(toContributorRowView),
	availableRows: file.rows.length,
})

export const toRepositoryRows = (file: RepositoryBoardFile, rows: number) =>
	file.rows.slice(0, rows).map((row): RepositoryRowView => ({
		rank: row.rank,
		repository: row.repository,
		language: row.language,
		contributors: row.contributors,
		mergedPullRequests: row.mergedPullRequests,
		stars: row.stars,
	}))

export const toContributorView = (entry: ShardEntry): ContributorView => ({
	login: entry.login,
	name: entry.name,
	location: entry.location,
	rank: entry.rank,
	polandRank: entry.boards.poland,
	percentile: entry.percentile,
	score: entry.score,
	mergedPullRequests: entry.mergedPullRequests + entry.selfMergedPullRequests,
	selfMergedPullRequests: entry.selfMergedPullRequests,
	repositories: entry.repositories.map(repository => ({
		repository: repository.repository,
		mergedPullRequests:
			repository.mergedPullRequests + repository.selfMergedPullRequests,
		score: repository.score,
		counted: repository.counted,
	})),
})

/** What a lookup shows: ranked, excluded for a reason, or not found. */
export function toContributorOutcome(
	login: string,
	entry: ShardEntry | undefined
): ContributorOutcome {
	if (!entry) return { state: 'notFound', login }

	return {
		state: entry.excluded ?? 'ranked',
		contributor: toContributorView(entry),
	}
}
