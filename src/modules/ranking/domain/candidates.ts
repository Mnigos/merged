import type { GitHubLogin } from '@shared/schema/github-login'
import type { CandidatePullRequest } from './files/candidates-file'
import { compareText } from './ranks'
import type { ScoredSeason } from './score-season'
import type { Season } from './season'

/** Contributors scoring pass 1 hands to enrichment. */
export const DEFAULT_CANDIDATE_CONTRIBUTORS = 3000

/** Repositories scoring pass 1 hands to enrichment at most; the ones with the most merged pull requests in the season go first. */
export const MAX_CANDIDATE_REPOSITORIES = 20_000

export interface Candidates {
	readonly contributors: readonly GitHubLogin[]
	readonly repositories: readonly string[]
	readonly pullRequests: readonly CandidatePullRequest[]
}

export interface CandidateLimits {
	readonly contributors: number
	/** `MAX_CANDIDATE_REPOSITORIES` by default. */
	readonly repositories?: number
}

export interface CandidatesInput {
	readonly season: Season
	readonly scored: ScoredSeason
}

/**
 * What enrichment fetches: profiles and mergers for the top contributors by
 * pass 1 rank and their merged pull requests, and real stars for every
 * repository of those contributors (excluded repositories are already
 * dropped), at most `repositories`, the ones with the most merged pull requests
 * in the season first, then by name. Other repositories keep archive proxies
 * for standing and whether they count.
 */
export function selectCandidates(
	{ season, scored }: CandidatesInput,
	{ contributors, repositories = MAX_CANDIDATE_REPOSITORIES }: CandidateLimits
): Candidates {
	const selected = scored.ranked.slice(0, contributors)
	const mergedPullRequestsOf = (repository: string) =>
		season.repositories.get(repository)?.mergedPullRequests ?? 0
	const candidateRepositories = [
		...new Set(
			selected.flatMap(contributor =>
				contributor.repositories.map(repository => repository.repository)
			)
		),
	]
		.toSorted(
			(left, right) =>
				mergedPullRequestsOf(right) - mergedPullRequestsOf(left) ||
				compareText(left, right)
		)
		.slice(0, repositories)
	const pullRequests = selected
		.flatMap(contributor =>
			contributor.repositories.flatMap(repository =>
				repository.pullRequests.map(number => ({
					repository: repository.repository,
					number,
					author: contributor.login,
				}))
			)
		)
		.toSorted(
			(left, right) =>
				compareText(left.repository, right.repository) ||
				left.number - right.number
		)

	return {
		contributors: selected.map(contributor => contributor.login),
		repositories: candidateRepositories,
		pullRequests,
	}
}
