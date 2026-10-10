import type { GitHubLogin } from '@shared/schema/github-login'
import type { CandidatePullRequest } from './files/candidates-file'
import { compareText } from './ranks'
import type { ScoredSeason } from './score-season'
import type { Season } from './season'

/** Contributors scoring pass 1 hands to enrichment. */
export const DEFAULT_CANDIDATE_CONTRIBUTORS = 3000

export interface Candidates {
	readonly contributors: readonly GitHubLogin[]
	readonly repositories: readonly string[]
	readonly pullRequests: readonly CandidatePullRequest[]
}

export interface CandidateLimits {
	readonly contributors: number
}

export interface CandidatesInput {
	readonly season: Season
	readonly scored: ScoredSeason
}

/**
 * What enrichment fetches: profiles and mergers for the top contributors by
 * pass 1 rank and their merged pull requests, and real stars for every
 * repository of the season (excluded repositories are already dropped), since
 * whether a repository counts depends on its real stars.
 */
export function selectCandidates(
	{ season, scored }: CandidatesInput,
	{ contributors }: CandidateLimits
): Candidates {
	const selected = scored.ranked.slice(0, contributors)
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
		repositories: [...season.repositories.keys()].toSorted(compareText),
		pullRequests,
	}
}
