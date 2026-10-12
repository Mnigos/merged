import type { GraphqlResponse } from '@shared/github/github-graphql.port'
import type { GraphqlHandler } from '@shared/github/testing/in-memory-github-graphql'

/** A merged pull request as a search node, in GitHub's JSON shape. */
export interface FakePullRequest {
	readonly number: number
	readonly mergedAt: string
	readonly author: {
		readonly login: string
		readonly __typename: string
	} | null
	readonly mergedBy: { readonly login: string } | null
	readonly repository: {
		readonly nameWithOwner: string
		readonly databaseId: number
		readonly owner: { readonly login: string }
	}
}

interface FakePullRequestInput {
	readonly number: number
	readonly mergedAt: string
	/** `owner/name`; the owner is the part before the slash. */
	readonly repository: string
	readonly repositoryId?: number
	/** `null` for a deleted author. */
	readonly author: string | null
	readonly authorType?: string
	readonly mergedBy?: string | null
}

/** Builds a search node; the repository id defaults to the number of characters of its name. */
export const fakePullRequest = ({
	number,
	mergedAt,
	repository,
	repositoryId = repository.length,
	author,
	authorType = 'User',
	mergedBy = null,
}: FakePullRequestInput): FakePullRequest => ({
	number,
	mergedAt,
	author: author === null ? null : { login: author, __typename: authorType },
	mergedBy: mergedBy === null ? null : { login: mergedBy },
	repository: {
		nameWithOwner: repository,
		databaseId: repositoryId,
		owner: { login: repository.split('/')[0] ?? '' },
	},
})

/** Results GitHub search serves at most for one query. */
const SEARCH_CAP = 1000

const MERGED_RANGE = /merged:(\S+)\.\.(\S+)/u

/** A `search` object as GitHub answers it. */
export interface FakeSearchPage {
	readonly issueCount: number
	readonly pageInfo: {
		readonly hasNextPage: boolean
		readonly endCursor: string | null
	}
	readonly nodes: readonly (FakePullRequest | null)[]
}

/**
 * The page GitHub search would answer over `pullRequests`: the
 * `merged:<from>..<to>` range of the query (both ends inclusive) selects
 * them, `first` and an offset `after` cursor page them, and like GitHub it
 * serves at most 1000 results per query while `issueCount` reports them all.
 */
export function toFakeSearchPage(
	pullRequests: readonly FakePullRequest[],
	variables: Readonly<Record<string, unknown>>
): FakeSearchPage {
	const [, from = '', to = ''] =
		MERGED_RANGE.exec(String(variables.query)) ?? []
	const fromMs = Date.parse(from)
	const toMs = Date.parse(to) + 999
	const matches = pullRequests.filter(pullRequest => {
		const mergedMs = Date.parse(pullRequest.mergedAt)

		return mergedMs >= fromMs && mergedMs <= toMs
	})
	const offset = Number(variables.after ?? 0)
	const end = Math.min(offset + Number(variables.first), SEARCH_CAP)

	return {
		issueCount: matches.length,
		pageInfo: {
			hasNextPage: end < Math.min(matches.length, SEARCH_CAP),
			endCursor: end > offset ? String(end) : null,
		},
		nodes: matches.slice(offset, end),
	}
}

/** A search response carrying `search` and a rate limit with `remaining` points. */
export const toFakeSearchResponse = (
	search: FakeSearchPage,
	remaining = 4999
): GraphqlResponse => ({
	data: {
		search,
		rateLimit: { cost: 1, remaining, resetAt: '2026-10-01T04:00:00Z' },
	},
	errors: [],
})

/** A GitHub search over `pullRequests`, see `toFakeSearchPage`. */
export const fakeGitHubSearchHandler =
	(pullRequests: readonly FakePullRequest[]): GraphqlHandler =>
	(_document, variables) =>
		toFakeSearchResponse(toFakeSearchPage(pullRequests, variables))
