import { GitHubGraphql } from '@shared/github/github-graphql.port'
import {
	buildBatchQuery,
	decodeBatch,
	type BatchEntry,
	type GraphqlBatchSpec,
} from '@shared/github/graphql-batch'
import { githubLoginSchema } from '@shared/schema/github-login'
import { Clock, Effect, Layer, type Schema } from 'effect'
import { ProfileSourceError } from '../application/profile-source.error'
import { ProfileSource } from '../application/profile-source.port'
import {
	pullRequestBatchSpec,
	pullRequestNodeSchema,
	repositoryBatchSpec,
	repositoryNodeSchema,
	userBatchSpec,
	userNodeSchema,
} from './github-profile-queries'

/** GraphQL error type of a node that does not exist (or is not visible). */
const NOT_FOUND = 'NOT_FOUND'

/**
 * `failed` when any error under the alias (on the node or nested, such as
 * `[alias, 'pullRequest']`) is not `NOT_FOUND`; otherwise `found` when GitHub
 * returned the node and `missing` when it does not exist.
 */
function toOutcome<TItem, TNode>(entry: BatchEntry<TItem, TNode>) {
	if (entry.errors.some(error => error.type !== NOT_FOUND)) return 'failed'

	return entry.node === null ? 'missing' : 'found'
}

interface FetchInput<TItem, TNode, TEncoded, TProfile> {
	readonly kind: string
	readonly spec: GraphqlBatchSpec<TItem>
	readonly nodeSchema: Schema.Codec<TNode, TEncoded>
	readonly items: readonly TItem[]
	/** Maps a found or missing entry to its profile (`node` is `null` when missing). */
	readonly toProfile: (
		entry: BatchEntry<TItem, TNode>,
		fetchedAt: string
	) => TProfile
}

/**
 * `ProfileSource` over `GitHubGraphql`: one aliased batch query per call.
 * A node GitHub does not find becomes a `missing` profile; an alias with any
 * other error, nested ones included, is left out and counted as failed.
 */
export const githubProfileSourceLayer = Layer.effect(
	ProfileSource,
	Effect.gen(function* () {
		const graphql = yield* GitHubGraphql

		const fetchBatch = <TItem, TNode, TEncoded, TProfile>({
			kind,
			spec,
			nodeSchema,
			items,
			toProfile,
		}: FetchInput<TItem, TNode, TEncoded, TProfile>) =>
			Effect.gen(function* () {
				const batch = buildBatchQuery(spec, items)
				const response = yield* graphql
					.query(batch.document, batch.variables)
					.pipe(
						Effect.mapError(
							error =>
								new ProfileSourceError({
									message: `${kind}: ${error.message}`,
								})
						)
					)
				const decoded = yield* decodeBatch(batch, nodeSchema, response).pipe(
					Effect.mapError(
						error =>
							new ProfileSourceError({
								message: `${kind}: ${[error.message, ...response.errors.map(graphqlError => graphqlError.message)].join('; ')}`,
							})
					)
				)
				const fetchedAt = new Date(yield* Clock.currentTimeMillis).toISOString()
				const profiles = decoded.entries
					.filter(entry => toOutcome(entry) !== 'failed')
					.map(entry => toProfile(entry, fetchedAt))

				return {
					profiles,
					failed: items.length - profiles.length,
					cost: decoded.rateLimit?.cost ?? 0,
					remaining: decoded.rateLimit?.remaining,
				}
			}).pipe(Effect.withSpan(`GitHubProfileSource.${kind}`))

		return {
			fetchRepositories: repositories =>
				fetchBatch({
					kind: 'repositories',
					spec: repositoryBatchSpec,
					nodeSchema: repositoryNodeSchema,
					items: repositories,
					toProfile: ({ item, node }, fetchedAt) => ({
						repository: item,
						stars: node?.stargazerCount ?? 0,
						language: node?.primaryLanguage?.name ?? null,
						fetchedAt,
						missing: node === null,
					}),
				}),
			fetchContributors: logins =>
				fetchBatch({
					kind: 'contributors',
					spec: userBatchSpec,
					nodeSchema: userNodeSchema,
					items: logins,
					toProfile: ({ item, node }, fetchedAt) => ({
						login: item,
						name: node?.name ?? null,
						location: node?.location ?? null,
						company: node?.company ?? null,
						avatarUrl: node?.avatarUrl ?? null,
						fetchedAt,
						missing: node === null,
					}),
				}),
			fetchMergers: pullRequests =>
				fetchBatch({
					kind: 'pullRequests',
					spec: pullRequestBatchSpec,
					nodeSchema: pullRequestNodeSchema,
					items: pullRequests,
					toProfile: ({ item, node }, fetchedAt) => {
						const pullRequest = node?.pullRequest
						const merger =
							pullRequest?.merged === true
								? pullRequest.mergedBy?.login
								: undefined

						return {
							repository: item.repository,
							number: item.number,
							mergedBy: merger
								? githubLoginSchema.make(merger.toLowerCase())
								: null,
							fetchedAt,
						}
					},
				}),
		}
	})
)
