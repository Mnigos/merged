import type { GitHubLogin } from '@shared/schema/github-login'

/** A merged pull request whose merger enrichment should resolve. */
export interface PullRequestTarget {
	/** Lowercase `owner/name`. */
	readonly repository: string
	readonly number: number
}

/**
 * What to enrich for a season. Profiles never picks candidates; the caller
 * hands over ranking's candidates (lowercase logins and repositories).
 */
export interface EnrichmentTargets {
	readonly contributors: readonly GitHubLogin[]
	readonly repositories: readonly string[]
	readonly pullRequests: readonly PullRequestTarget[]
}
