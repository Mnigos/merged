import type { GitHubLogin } from '@shared/schema/github-login'

/** What enrichment knows about a repository. */
export interface RepositoryProfile {
	readonly stars: number
	readonly language: string | null
}

/** What enrichment knows about a contributor. */
export interface ContributorProfile {
	readonly name: string | null
	readonly location: string | null
	readonly isBot: boolean
}

/** Key of a pull request in `SeasonEnrichment.mergers`: `owner/repo#number`, lowercase repository. */
export type PullRequestKey = `${string}#${number}`

/**
 * Facts the profiles module fetches from GitHub for the season's candidates.
 * Every map is partial: a missing entry means "not enriched", and ranking falls
 * back to archive proxies (scoring pass 1).
 */
export interface SeasonEnrichment {
	/** Keyed by lowercase repository name. */
	readonly repositories: ReadonlyMap<string, RepositoryProfile>
	/** Keyed by lowercase login. */
	readonly contributors: ReadonlyMap<GitHubLogin, ContributorProfile>
	/** Lowercase login of whoever merged the pull request. */
	readonly mergers: ReadonlyMap<PullRequestKey, GitHubLogin>
}

/** Enrichment of scoring pass 1: nothing is known beyond the archive. */
export const emptyEnrichment = {
	repositories: new Map<string, RepositoryProfile>(),
	contributors: new Map<GitHubLogin, ContributorProfile>(),
	mergers: new Map<PullRequestKey, GitHubLogin>(),
} as const satisfies SeasonEnrichment

/** Key of a merged pull request in `SeasonEnrichment.mergers`. */
export const toPullRequestKey = (
	repository: string,
	number: number
): PullRequestKey => `${repository}#${number}`
