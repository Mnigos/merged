import { isBot } from '@shared/github/bots'
import type { GitHubLogin } from '@shared/schema/github-login'
import { repositoryCounts } from './counts'
import { toPullRequestKey, type SeasonEnrichment } from './enrichment'
import { compareText, toCompetitionRanks, toPercentiles } from './ranks'
import { scoreBreakdown } from './scoring'
import type {
	RepositoryContribution,
	Season,
	SeasonContributor,
} from './season'
import { repositoryStanding } from './standing'

/** A contributor's result in one repository after mergers are resolved. */
export interface ScoredRepository {
	readonly repository: string
	/** Merged by someone else, or by an unknown merger. */
	readonly merged: number
	readonly selfMerged: number
	readonly standing: number
	/** Whether the repository counts (see `repositoryCounts`); an uncounted one scores 0. */
	readonly counted: boolean
	/** Integer share of the contributor's score; shares sum to the score. */
	readonly score: number
	/** Numbers of the season's merged pull requests, for candidate selection. */
	readonly pullRequests: readonly number[]
}

export interface ContributorResult {
	readonly login: GitHubLogin
	/** Integer score, see `scoreBreakdown`. */
	readonly score: number
	readonly merged: number
	readonly selfMerged: number
	/** Counted repositories first, then by score, best first, then by name. */
	readonly repositories: readonly ScoredRepository[]
}

export interface RankedContributor extends ContributorResult {
	readonly rank: number
	readonly percentile: number
}

/**
 * Why a contributor is kept off every board: a bot, or none of their
 * repositories counts yet (see `repositoryCounts`).
 */
export type Exclusion = 'bot' | 'noCountedRepository'

export interface ExcludedContributor extends ContributorResult {
	readonly exclusion: Exclusion
}

export interface ScoredSeason {
	/** By score descending, then login ascending. */
	readonly ranked: readonly RankedContributor[]
	/** Contributors that scored but are kept off every board, by login. */
	readonly excluded: readonly ExcludedContributor[]
}

interface ResolveInput {
	readonly login: GitHubLogin
	readonly repository: string
	readonly contribution: RepositoryContribution
	readonly enrichment: SeasonEnrichment
}

/** A merged pull request whose merger turns out to be its author (compared lowercase) counts as self-merged. */
function resolveMergeKinds({
	login,
	repository,
	contribution,
	enrichment,
}: ResolveInput) {
	const author = login.toLowerCase()
	const resolvedSelfMerges = contribution.mergedPullRequests.filter(
		number =>
			enrichment.mergers
				.get(toPullRequestKey(repository, number))
				?.toLowerCase() === author
	).length

	return {
		merged: contribution.merged - resolvedSelfMerges,
		selfMerged: contribution.selfMerged + resolvedSelfMerges,
	}
}

interface RepositoryAssessment {
	readonly standing: number
	readonly counted: boolean
}

function scoreContributor(
	contributor: SeasonContributor,
	assessments: ReadonlyMap<string, RepositoryAssessment>,
	enrichment: SeasonEnrichment
): ContributorResult {
	const contributions = [...contributor.repositories].map(
		([repository, contribution]) => ({
			repository,
			standing: assessments.get(repository)?.standing ?? 0,
			counted: assessments.get(repository)?.counted ?? false,
			pullRequests: contribution.mergedPullRequests,
			...resolveMergeKinds({
				login: contributor.login,
				repository,
				contribution,
				enrichment,
			}),
		})
	)
	const breakdown = scoreBreakdown(
		contributions
			.filter(contribution => contribution.counted)
			.map(contribution => ({
				repository: contribution.repository,
				popularity: contribution.standing,
				prs: {
					merged: contribution.merged,
					selfMerged: contribution.selfMerged,
					ownRepo: 0,
				},
			}))
	)
	const repositories = contributions
		.map(contribution => ({
			...contribution,
			score: breakdown.repositories.get(contribution.repository) ?? 0,
		}))
		.toSorted(
			(left, right) =>
				Number(right.counted) - Number(left.counted) ||
				right.score - left.score ||
				compareText(left.repository, right.repository)
		)

	return {
		login: contributor.login,
		score: breakdown.total,
		merged: repositories.reduce((total, repo) => total + repo.merged, 0),
		selfMerged: repositories.reduce(
			(total, repo) => total + repo.selfMerged,
			0
		),
		repositories,
	}
}

/**
 * Scores every contributor of the season: resolves self-merges from known
 * mergers, applies repository standing, scores counted repositories with
 * diminishing returns per owner. Bots (the shared `isBot` rules, so day files
 * ingested before a rule change benefit too, or flagged by enrichment) and
 * contributors without a counted repository are excluded but kept so lookup
 * can explain. Ranks are competition ranks over integer scores.
 */
export function scoreSeason(
	season: Season,
	enrichment: SeasonEnrichment
): ScoredSeason {
	const assessments = new Map(
		[...season.repositories.values()].map(repository => {
			const facts = {
				contributors: repository.contributors,
				starsInSeason: repository.starsInSeason,
				stars: enrichment.repositories.get(repository.repository)?.stars,
			}

			return [
				repository.repository,
				{
					standing: repositoryStanding(facts),
					counted: repositoryCounts(facts),
				},
			]
		})
	)
	const exclusionOf = (result: ContributorResult): Exclusion | undefined => {
		if (
			isBot(result.login) ||
			enrichment.contributors.get(result.login)?.isBot === true
		)
			return 'bot'
		if (!result.repositories.some(repository => repository.counted))
			return 'noCountedRepository'

		return undefined
	}
	const results = [
		...season.contributors.values(),
		...season.bots.values(),
	].map(contributor => {
		const result = scoreContributor(contributor, assessments, enrichment)

		return { result, exclusion: exclusionOf(result) }
	})

	const sorted = results
		.filter(({ result, exclusion }) => !exclusion && result.score > 0)
		.map(({ result }) => result)
		.toSorted(
			(left, right) =>
				right.score - left.score || compareText(left.login, right.login)
		)
	const ranks = toCompetitionRanks(
		sorted,
		(previous, current) => previous.score === current.score
	)
	const percentiles = toPercentiles(sorted.map(result => result.score))

	return {
		ranked: sorted.map((result, index) => ({
			...result,
			rank: ranks[index] ?? index + 1,
			percentile: percentiles[index] ?? 0,
		})),
		excluded: results
			.flatMap(({ result, exclusion }) =>
				exclusion ? [{ ...result, exclusion }] : []
			)
			.toSorted((left, right) => compareText(left.login, right.login)),
	}
}
