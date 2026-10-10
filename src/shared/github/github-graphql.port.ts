import { Context, type Effect } from 'effect'
import type { GitHubGraphqlError } from './github-graphql.error'

/** One entry of a GraphQL `errors` array; `path` starts with the alias it belongs to. */
export interface GraphqlError {
	readonly message: string
	readonly type?: string
	readonly path?: readonly (string | number)[]
}

/**
 * A GraphQL response as GitHub returns it. Partial data is normal: a missing
 * node is `null` under its alias plus a `NOT_FOUND` error, so callers decode
 * `data` with their own Schema and read `errors` per alias.
 */
export interface GraphqlResponse {
	readonly data: unknown
	readonly errors: readonly GraphqlError[]
}

export interface GitHubGraphqlShape {
	readonly query: (
		document: string,
		variables: Readonly<Record<string, unknown>>
	) => Effect.Effect<GraphqlResponse, GitHubGraphqlError>
}

/** GitHub GraphQL API: one query at a time, retried and kept under the rate limit by the adapter. */
export class GitHubGraphql extends Context.Service<
	GitHubGraphql,
	GitHubGraphqlShape
>()('shared/GitHubGraphql') {}
