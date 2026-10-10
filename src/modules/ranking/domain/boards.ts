import type { GitHubLogin } from '@shared/schema/github-login'
import type { SeasonId } from '@shared/schema/season-id'
import type { SeasonEnrichment } from './enrichment'
import type {
	BoardFile,
	BoardRow,
	ContributorBoardId,
	RepositoryBoardFile,
} from './files/board-file'
import { isPolandLocation } from './poland'
import { compareText, toCompetitionRanks } from './ranks'
import type { RankedContributor, ScoredSeason } from './score-season'
import type { Season, SeasonRepository } from './season'

/** Rows written to a board file. */
export const BOARD_SIZE = 100

/** Repositories listed on a board row. */
export const TOP_REPOSITORIES = 3

/** A contributor ranked on a board other than Global, with the board's own rank. */
export interface BoardPlacement {
	readonly contributor: RankedContributor
	readonly rank: number
}

/**
 * Every contributor whose enriched location passes `isPolandLocation`, ranked
 * among themselves. Without enrichment nobody has a location, so the board is
 * empty in scoring pass 1.
 */
export function rankPoland(
	scored: ScoredSeason,
	enrichment: SeasonEnrichment
): readonly BoardPlacement[] {
	const polish = scored.ranked.filter(contributor =>
		isPolandLocation(enrichment.contributors.get(contributor.login)?.location)
	)
	const ranks = toCompetitionRanks(
		polish,
		(previous, current) => previous.score === current.score
	)

	return polish.map((contributor, index) => ({
		contributor,
		rank: ranks[index] ?? index + 1,
	}))
}

function toBoardRow(
	{ contributor, rank }: BoardPlacement,
	enrichment: SeasonEnrichment
): BoardRow {
	const profile = enrichment.contributors.get(contributor.login)

	return {
		rank,
		login: contributor.login,
		score: contributor.score,
		percentile: contributor.percentile,
		mergedPullRequests: contributor.merged,
		selfMergedPullRequests: contributor.selfMerged,
		repositories: contributor.repositories.length,
		topRepositories: contributor.repositories
			.slice(0, TOP_REPOSITORIES)
			.map(repository => ({
				repository: repository.repository,
				mergedPullRequests: repository.merged + repository.selfMerged,
				counted: repository.counted,
				score: repository.score,
			})),
		name: profile?.name ?? null,
		location: profile?.location ?? null,
	}
}

interface BoardFileInput {
	readonly seasonId: SeasonId
	readonly board: ContributorBoardId
	readonly placements: readonly BoardPlacement[]
	readonly enrichment: SeasonEnrichment
	readonly computedAt: string
}

const toBoardFile = ({
	seasonId,
	board,
	placements,
	enrichment,
	computedAt,
}: BoardFileInput): BoardFile => ({
	season: seasonId,
	board,
	computedAt,
	contributors: placements.length,
	rows: placements
		.slice(0, BOARD_SIZE)
		.map(placement => toBoardRow(placement, enrichment)),
})

const byContributorsThenPullRequests = (
	left: SeasonRepository,
	right: SeasonRepository
) =>
	right.contributors - left.contributors ||
	right.mergedPullRequests - left.mergedPullRequests ||
	compareText(left.repository, right.repository)

function toRepositoryBoardFile(
	season: Season,
	enrichment: SeasonEnrichment,
	computedAt: string
): RepositoryBoardFile {
	const sorted = [...season.repositories.values()]
		.toSorted(byContributorsThenPullRequests)
		.slice(0, BOARD_SIZE)
	const ranks = toCompetitionRanks(
		sorted,
		(previous, current) =>
			previous.contributors === current.contributors &&
			previous.mergedPullRequests === current.mergedPullRequests
	)

	return {
		season: season.seasonId,
		board: 'repositories',
		computedAt,
		rows: sorted.map((repository, index) => {
			const profile = enrichment.repositories.get(repository.repository)

			return {
				rank: ranks[index] ?? index + 1,
				repository: repository.repository,
				contributors: repository.contributors,
				mergedPullRequests: repository.mergedPullRequests,
				starsInSeason: repository.starsInSeason,
				stars: profile?.stars ?? null,
				language: profile?.language ?? null,
			}
		}),
	}
}

export interface BoardsInput {
	readonly season: Season
	readonly scored: ScoredSeason
	readonly enrichment: SeasonEnrichment
	readonly computedAt: string
}

export interface Boards {
	readonly global: BoardFile
	readonly poland: BoardFile
	readonly repositories: RepositoryBoardFile
	/** Poland board rank of every Polish contributor, not only the top 100. */
	readonly polandRanks: ReadonlyMap<GitHubLogin, number>
}

/**
 * The season's board files: Global and Poland top 100 contributors (each with
 * its own ranks, the season percentile), and the top 100 repositories by
 * distinct contributors, then merged pull requests.
 */
export function buildBoards({
	season,
	scored,
	enrichment,
	computedAt,
}: BoardsInput): Boards {
	const poland = rankPoland(scored, enrichment)

	return {
		global: toBoardFile({
			seasonId: season.seasonId,
			board: 'global',
			placements: scored.ranked.map(contributor => ({
				contributor,
				rank: contributor.rank,
			})),
			enrichment,
			computedAt,
		}),
		poland: toBoardFile({
			seasonId: season.seasonId,
			board: 'poland',
			placements: poland,
			enrichment,
			computedAt,
		}),
		repositories: toRepositoryBoardFile(season, enrichment, computedAt),
		polandRanks: new Map(
			poland.map(({ contributor, rank }) => [contributor.login, rank])
		),
	}
}
