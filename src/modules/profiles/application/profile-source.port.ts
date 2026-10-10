import type { GitHubLogin } from '@shared/schema/github-login'
import { Context, type Effect } from 'effect'
import type { ContributorProfile } from '../domain/contributor-profile'
import type { PullRequestTarget } from '../domain/enrichment-targets'
import type { MergeResolution } from '../domain/merge-resolution'
import type { RepositoryProfile } from '../domain/repository-profile'
import type { ProfileSourceError } from './profile-source.error'

/** Profiles fetched in one query, missing ones included. */
export interface FetchedBatch<TProfile> {
	readonly profiles: readonly TProfile[]
	/** Items GitHub answered with an error other than not found; fetched again next run. */
	readonly failed: number
	/** Points the query cost. */
	readonly cost: number
	/** Points left in the hourly budget after the query, when GitHub reported it. */
	readonly remaining: number | undefined
}

type Fetch<TItem, TProfile> = (
	items: readonly TItem[]
) => Effect.Effect<FetchedBatch<TProfile>, ProfileSourceError>

/** Where enrichment comes from; each call is one query of at most `MAX_BATCH_SIZE` items. */
export interface ProfileSourceShape {
	readonly fetchRepositories: Fetch<string, RepositoryProfile>
	readonly fetchContributors: Fetch<GitHubLogin, ContributorProfile>
	readonly fetchMergers: Fetch<PullRequestTarget, MergeResolution>
}

export class ProfileSource extends Context.Service<
	ProfileSource,
	ProfileSourceShape
>()('profiles/ProfileSource') {}
