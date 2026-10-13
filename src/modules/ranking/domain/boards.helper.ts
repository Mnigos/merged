import type { GitHubLogin } from '@shared/schema/github-login.schema'
import type { SeasonId } from '@shared/schema/season-id.schema'
import { findCountry, toFlag, type CountryCode } from './countries.model'
import { countryOf } from './country.helper'
import type { SeasonEnrichment } from './enrichment.model'
import type {
	BoardFile,
	BoardRow,
	ContributorBoardId,
	RepositoryBoardFile,
} from './files/board.file'
import type { CountrySummary } from './files/file-fields.schema'
import type { CountryRank } from './files/shard.file'
import { compareText, toCompetitionRanks } from './ranks.helper'
import type { RankedContributor, ScoredSeason } from './score-season.helper'
import type { Season, SeasonRepository } from './season.model'

/** Rows written to a board file. */
export const BOARD_SIZE = 100

/** Repositories listed on a board row. */
export const TOP_REPOSITORIES = 3

/** Ranked contributors a country needs for its own board. */
export const COUNTRY_BOARD_MIN_CONTRIBUTORS = 10

/** A contributor ranked on a board other than Global, with the board's own rank. */
export interface BoardPlacement {
	readonly contributor: RankedContributor
	readonly rank: number
}

const toPlacements = (
	contributors: readonly RankedContributor[]
): readonly BoardPlacement[] => {
	const ranks = toCompetitionRanks(
		contributors,
		(previous, current) => previous.score === current.score
	)

	return contributors.map((contributor, index) => ({
		contributor,
		rank: ranks[index] ?? index + 1,
	}))
}

/**
 * Country boards: every ranked contributor whose enriched location names a
 * country (`countryOf`), grouped by country and ranked among themselves.
 * Only countries with at least `COUNTRY_BOARD_MIN_CONTRIBUTORS` get a board;
 * boards are ordered by contributors, then code. Without enrichment nobody
 * has a location, so there are no boards in scoring pass 1.
 */
export function rankCountries(
	scored: ScoredSeason,
	enrichment: SeasonEnrichment
): ReadonlyMap<CountryCode, readonly BoardPlacement[]> {
	const byCountry = Map.groupBy(
		scored.ranked.flatMap(contributor => {
			const code = countryOf(
				enrichment.contributors.get(contributor.login)?.location
			)

			return code ? [{ code, contributor }] : []
		}),
		placement => placement.code
	)

	return new Map(
		[...byCountry]
			.filter(
				([, contributors]) =>
					contributors.length >= COUNTRY_BOARD_MIN_CONTRIBUTORS
			)
			.toSorted(
				([leftCode, left], [rightCode, right]) =>
					right.length - left.length || compareText(leftCode, rightCode)
			)
			.map(([code, contributors]) => [
				code,
				toPlacements(contributors.map(({ contributor }) => contributor)),
			])
	)
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
	readonly country?: CountrySummary
	readonly placements: readonly BoardPlacement[]
	readonly enrichment: SeasonEnrichment
	readonly computedAt: string
}

const toBoardFile = ({
	seasonId,
	board,
	country,
	placements,
	enrichment,
	computedAt,
}: BoardFileInput): BoardFile => ({
	season: seasonId,
	board,
	...(country && { country }),
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
	/** One board per country with enough contributors, most contributors first. */
	readonly countries: readonly BoardFile[]
	readonly repositories: RepositoryBoardFile
	/** Country board rank of every contributor on one, not only the top 100. */
	readonly countryRanks: ReadonlyMap<GitHubLogin, CountryRank>
}

const toCountrySummary = (
	code: CountryCode,
	contributors: number
): CountrySummary => ({
	code,
	name: findCountry(code)?.name ?? code.toUpperCase(),
	flag: toFlag(code),
	contributors,
})

/**
 * The season's board files: Global and country top 100 contributors (each
 * with its own ranks, the season percentile), and the top 100 repositories by
 * distinct contributors, then merged pull requests.
 */
export function buildBoards({
	season,
	scored,
	enrichment,
	computedAt,
}: BoardsInput): Boards {
	const countries = [...rankCountries(scored, enrichment)]

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
		countries: countries.map(([code, placements]) =>
			toBoardFile({
				seasonId: season.seasonId,
				board: 'country',
				country: toCountrySummary(code, placements.length),
				placements,
				enrichment,
				computedAt,
			})
		),
		repositories: toRepositoryBoardFile(season, enrichment, computedAt),
		countryRanks: new Map(
			countries.flatMap(([code, placements]) =>
				placements.map(({ contributor, rank }) => [
					contributor.login,
					{ code, rank },
				])
			)
		),
	}
}
