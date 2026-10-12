import { GitHubGraphql } from '@shared/github/github-graphql.port'
import type { IsoDate } from '@shared/schema/iso-date'
import { Config, Effect, Layer, Schedule, Schema } from 'effect'
import { IngestSource } from '../../application/ingest-source.port'
import { SearchSourceError } from '../../application/search-source.error'
import {
	decodeSearchResponse,
	SEARCH_DOCUMENT,
	type SearchPage,
	type SearchPullRequest,
	toSearchHourEvents,
} from './github-search-query'
import {
	splitSearchWindow,
	toHourWindows,
	toSearchQuery,
	toWindowRange,
	toWindowSeconds,
	type SearchWindow,
} from './search-windows'

export interface GithubSearchOptions {
	/**
	 * Search windows of an hour read at the same time. Two sustain about 27
	 * queries a minute; more only add secondary rate limit 403s (measured
	 * 2026-10-12, see ADR 0006).
	 */
	readonly concurrency: number
	/** Results per query; GitHub cuts a query at about 10 s, so 100 mostly answers 502 or 504. */
	readonly pageSize: number
	/** Shortest window a window with too many results is split down to before the hour fails. */
	readonly minWindowSeconds: number
	/** Retries of a failed page on top of the GraphQL client's own, before the hour fails. */
	readonly retries: number
}

export const DEFAULT_SEARCH_OPTIONS = {
	concurrency: 2,
	pageSize: 50,
	minWindowSeconds: 1,
	retries: 3,
} as const satisfies GithubSearchOptions

/** Results GitHub search returns at most for one query, across all its pages. */
export const SEARCH_RESULT_CAP = 1000

/** Search queries in flight, read from `SEARCH_CONCURRENCY`, `DEFAULT_SEARCH_OPTIONS.concurrency` by default. */
export const searchConcurrencyConfig = Config.schema(
	Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
	'SEARCH_CONCURRENCY'
).pipe(Config.withDefault(DEFAULT_SEARCH_OPTIONS.concurrency))

interface WindowResults {
	readonly results: readonly (SearchPullRequest | null)[]
	readonly requests: number
}

/**
 * `IngestSource` over the GitHub search API: an hour is read as 60 one-minute
 * windows (`merged:<start>..<end>`), `concurrency` at a time, each paged
 * `pageSize` results per query. A window reporting more than
 * `SEARCH_RESULT_CAP` results is halved, down to `minWindowSeconds`, so
 * nothing is silently cut off. A failed page (5xx, HTML, network, a GraphQL
 * timeout) is retried with jittered exponential backoff by the client and
 * `retries` more times here, then fails the hour with `SearchSourceError`.
 * Rate limits are waited out by `GitHubGraphql`.
 */
export const toGithubSearchIngestSourceLayer = (
	options: Partial<GithubSearchOptions> = {}
) =>
	Layer.effect(
		IngestSource,
		Effect.gen(function* () {
			const graphql = yield* GitHubGraphql
			const { concurrency, pageSize, minWindowSeconds, retries } = {
				...DEFAULT_SEARCH_OPTIONS,
				...options,
			}

			const readHour = Effect.fn('GithubSearchIngestSource.readHour')(
				function* (date: IsoDate, hour: number) {
					const toError = (window: SearchWindow, message: string) =>
						new SearchSourceError({
							date,
							hour,
							message: `GitHub search ${toWindowRange(window)}: ${message}`,
						})

					const fetchPage = (window: SearchWindow, after: string | null) =>
						graphql
							.query(SEARCH_DOCUMENT, {
								query: toSearchQuery(window),
								first: pageSize,
								after,
							})
							.pipe(
								Effect.flatMap(decodeSearchResponse),
								Effect.retry({
									schedule: Schedule.exponential('2 seconds').pipe(
										Schedule.jittered
									),
									times: retries,
									while: error => error.retryable,
								}),
								Effect.mapError(error => toError(window, error.message))
							)

					const readPages = Effect.fn('GithubSearchIngestSource.readPages')(
						function* (window: SearchWindow, first: SearchPage) {
							const results = [...first.search.nodes]
							let page = first
							let after: string | null = null
							let requests = 1
							while (
								page.search.pageInfo.hasNextPage &&
								page.search.pageInfo.endCursor !== null
							) {
								if (page.search.pageInfo.endCursor === after)
									return yield* Effect.fail(
										toError(
											window,
											`cursor ${after} did not advance after page ${requests}, stopping instead of looping`
										)
									)
								after = page.search.pageInfo.endCursor
								page = yield* fetchPage(window, after)
								results.push(...page.search.nodes)
								requests++
							}
							yield* Effect.logInfo('search window read').pipe(
								Effect.annotateLogs({
									hour,
									window: toWindowRange(window),
									found: first.search.issueCount,
									results: results.length,
									requests,
								})
							)

							return { results, requests }
						}
					)

					const readWindow = (
						window: SearchWindow
					): Effect.Effect<WindowResults, SearchSourceError> =>
						Effect.gen(function* () {
							const first = yield* fetchPage(window, null)
							const { issueCount: found } = first.search
							if (found <= SEARCH_RESULT_CAP)
								return yield* readPages(window, first)
							if (Math.floor(toWindowSeconds(window) / 2) < minWindowSeconds)
								return yield* Effect.fail(
									toError(
										window,
										`${found} results exceed the ${SEARCH_RESULT_CAP} search returns, and the window cannot be split below ${minWindowSeconds} s`
									)
								)

							const halves = yield* Effect.forEach(
								splitSearchWindow(window),
								readWindow
							)

							return {
								results: halves.flatMap(half => half.results),
								requests:
									1 + halves.reduce((total, half) => total + half.requests, 0),
							}
						})

					const windows = yield* Effect.forEach(
						toHourWindows(date, hour),
						readWindow,
						{ concurrency }
					)

					return toSearchHourEvents({
						results: windows.flatMap(window => window.results),
						requests: windows.reduce(
							(total, window) => total + window.requests,
							0
						),
					})
				}
			)

			return { readHour }
		})
	)
