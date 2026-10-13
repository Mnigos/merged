import { Effect, Layer } from 'effect'
import type { GitHubGraphqlError } from '../github-graphql.error'
import { GitHubGraphql, type GraphqlResponse } from '../github-graphql.port'

/** One query the in-memory GraphQL layer received. */
export interface GraphqlCall {
	readonly document: string
	readonly variables: Readonly<Record<string, unknown>>
}

/** Answers a query in specs, with a plain response or an Effect (to fail or wait). */
export type GraphqlHandler = (
	document: string,
	variables: Readonly<Record<string, unknown>>
) => GraphqlResponse | Effect.Effect<GraphqlResponse, GitHubGraphqlError>

/**
 * Test `GitHubGraphql` answering every query with `handler`. Pass a `calls`
 * array to inspect the queries afterwards.
 */
export const inMemoryGitHubGraphqlLayer = (
	handler: GraphqlHandler,
	calls: GraphqlCall[] = []
) =>
	Layer.succeed(GitHubGraphql, {
		query: (document, variables) =>
			Effect.suspend(() => {
				calls.push({ document, variables })
				const answer = handler(document, variables)

				return Effect.isEffect(answer) ? answer : Effect.succeed(answer)
			}),
	})
