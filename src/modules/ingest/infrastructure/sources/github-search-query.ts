import { isBot } from '@shared/github/bots'
import { RATE_LIMIT_FIELD } from '@shared/github/github-graphql-rate-limit'
import { githubLoginSchema } from '@shared/schema/github-login'
import { Schema } from 'effect'
import type { HourEvents } from '../../application/ingest-source.port'
import { classifyMerge, type MergeEvent } from '../../domain/merge-event'

/**
 * One page of merged pull requests from GitHub search, plus the rate limit.
 * Each query costs one point; GitHub cuts a query at about 10 s.
 */
export const SEARCH_DOCUMENT = `query($query: String!, $first: Int!, $after: String) { search(type: ISSUE, query: $query, first: $first, after: $after) { issueCount pageInfo { hasNextPage endCursor } nodes { ... on PullRequest { number mergedAt author { login __typename } mergedBy { login } repository { nameWithOwner databaseId owner { login } } } } } ${RATE_LIMIT_FIELD} }`

/** `__typename` of a GitHub App author such as `dependabot`, whose login has no `[bot]` suffix in GraphQL. */
const BOT_TYPENAME = 'Bot'

const searchPullRequestSchema = Schema.Struct({
	number: Schema.Number,
	mergedAt: Schema.String,
	author: Schema.NullOr(
		Schema.Struct({ login: githubLoginSchema, __typename: Schema.String })
	),
	mergedBy: Schema.NullOr(Schema.Struct({ login: githubLoginSchema })),
	repository: Schema.Struct({
		nameWithOwner: Schema.String,
		databaseId: Schema.Number,
		owner: Schema.Struct({ login: Schema.String }),
	}),
})
export type SearchPullRequest = typeof searchPullRequestSchema.Type

/** `data` of a `SEARCH_DOCUMENT` response; a node is `null` when GitHub could not resolve it. */
export const searchPageSchema = Schema.Struct({
	search: Schema.Struct({
		issueCount: Schema.Number,
		pageInfo: Schema.Struct({
			hasNextPage: Schema.Boolean,
			endCursor: Schema.NullOr(Schema.String),
		}),
		nodes: Schema.Array(Schema.NullOr(searchPullRequestSchema)),
	}),
})
export type SearchPage = typeof searchPageSchema.Type

export const decodeSearchPage = Schema.decodeUnknownEffect(searchPageSchema)

interface SearchHourInput {
	/** Nodes of every page of the hour's windows, repeats included. */
	readonly results: readonly (SearchPullRequest | null)[]
	readonly requests: number
}

/**
 * The hour's merges from search results: a pull request found twice (by
 * `repository.databaseId` and number) counts once, an unresolved node or a
 * pull request whose author was deleted is ignored, bots (`isBot` or a `Bot`
 * account) are excluded, and the merge kind comes from `classifyMerge`.
 * Search has no stars.
 */
export function toSearchHourEvents({
	results,
	requests,
}: SearchHourInput): HourEvents {
	const seen = new Set<string>()
	const merges: MergeEvent[] = []
	let eventsDecoded = 0
	let ignoredEvents = 0
	let botEvents = 0

	for (const pullRequest of results) {
		if (pullRequest !== null) {
			const key = `${pullRequest.repository.databaseId}#${pullRequest.number}`
			if (seen.has(key)) continue
			seen.add(key)
		}
		eventsDecoded++
		const author = pullRequest?.author
		if (!pullRequest || !author) {
			ignoredEvents++
			continue
		}
		if (author.__typename === BOT_TYPENAME || isBot(author.login)) {
			botEvents++
			continue
		}

		const owner = pullRequest.repository.owner.login
		const mergedBy = pullRequest.mergedBy?.login
		merges.push({
			author: author.login,
			repository: pullRequest.repository.nameWithOwner,
			repositoryId: pullRequest.repository.databaseId,
			owner,
			mergedBy,
			mergedAt: pullRequest.mergedAt,
			number: pullRequest.number,
			mergeKind: classifyMerge({ author: author.login, owner, mergedBy }),
		})
	}

	return {
		merges,
		stars: [],
		counts: {
			requests,
			bytesDownloaded: 0,
			linesSeen: 0,
			linesPreFiltered: 0,
			eventsDecoded,
			invalidLines: 0,
			ignoredEvents,
			botEvents,
		},
	}
}
