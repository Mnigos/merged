import { describe, expect, it } from '@effect/vitest'
import {
	MIN_REMAINING_POINTS,
	toGithubGraphqlHttpLayer,
} from '@shared/github/github-graphql-http'
import { GitHubGraphqlError } from '@shared/github/github-graphql.error'
import {
	inMemoryGitHubGraphqlLayer,
	type GraphqlCall,
	type GraphqlHandler,
} from '@shared/github/testing/in-memory-github-graphql'
import { isoDateSchema } from '@shared/schema/iso-date'
import { ConfigProvider, Effect, Fiber, Layer, Schema } from 'effect'
import {
	HttpClient,
	type HttpClientRequest,
	HttpClientResponse,
} from 'effect/http'
import { TestClock } from 'effect/testing'
import { IngestSource } from '../../application/ingest-source.port'
import {
	fakeGitHubSearchHandler,
	fakePullRequest,
	toFakeSearchPage,
	toFakeSearchResponse,
	type FakePullRequest,
} from '../../testing/fake-github-search.mock'
import {
	DEFAULT_SEARCH_OPTIONS,
	SEARCH_RESULT_CAP,
	searchConcurrencyConfig,
	toGithubSearchIngestSourceLayer,
	type GithubSearchOptions,
} from './github-search-ingest-source'

const date = isoDateSchema.make('2026-10-01')

const merge = (
	number: number,
	mergedAt: string,
	author: string | null = 'alice',
	repository = 'acme/widgets'
) =>
	fakePullRequest({
		number,
		mergedAt,
		author,
		repository,
		mergedBy: 'maintainer',
	})

/** `count` pull requests merged in the second `at`, numbered from `from`. */
const mergesAt = (at: string, count: number, from = 1) =>
	Array.from({ length: count }, (_, index) => merge(from + index, at))

const searchQuery = (range: string) =>
	`is:pr is:merged is:public merged:${range}`

const sourceOver = (
	handler: GraphqlHandler,
	options: Partial<GithubSearchOptions> = {}
) => {
	const calls: GraphqlCall[] = []
	const layer = toGithubSearchIngestSourceLayer(options).pipe(
		Layer.provide(inMemoryGitHubGraphqlLayer(handler, calls))
	)

	return { calls, layer }
}

const readHour = (hour = 3) =>
	Effect.gen(function* () {
		const source = yield* IngestSource

		return yield* source.readHour(date, hour)
	})

const queriesOf = (calls: readonly GraphqlCall[]) =>
	calls.map(call => String(call.variables.query))

/** Search over `pullRequests` that adds `extraNodes` to every page of the windows starting at `minutes`. */
const withExtraNodes =
	(
		pullRequests: readonly FakePullRequest[],
		minutes: readonly string[],
		extraNodes: readonly (FakePullRequest | null)[]
	): GraphqlHandler =>
	(_document, variables) => {
		const page = toFakeSearchPage(pullRequests, variables)
		const query = String(variables.query)
		if (!minutes.some(minute => query.includes(`T03:${minute}:00Z..`)))
			return toFakeSearchResponse(page)

		return toFakeSearchResponse({
			...page,
			nodes: [...page.nodes, ...extraNodes],
		})
	}

const timeoutResponse = {
	data: null,
	errors: [
		{
			message:
				'Something went wrong while executing your query. This may be the result of a timeout.',
		},
	],
}

const failingWith = (status: number, retryable: boolean) => () =>
	Effect.fail(
		new GitHubGraphqlError({
			message: `GitHub GraphQL responded ${status}`,
			status,
			retryable,
		})
	)

/** Answers every query after a 5 s wait and records how many ran at once. */
function concurrencyProbe() {
	const probe = { inFlight: 0, peak: 0 }
	const handler: GraphqlHandler = (_document, variables) =>
		Effect.gen(function* () {
			probe.inFlight++
			probe.peak = Math.max(probe.peak, probe.inFlight)
			yield* Effect.sleep('5 seconds')
			probe.inFlight--

			return toFakeSearchResponse(toFakeSearchPage([], variables))
		})

	return { probe, handler }
}

describe('toGithubSearchIngestSourceLayer', () => {
	it.effect(
		'queries every one-minute window of the hour once, 50 per page',
		() => {
			const { calls, layer } = sourceOver(fakeGitHubSearchHandler([]))

			return Effect.gen(function* () {
				const events = yield* readHour()
				const queries = queriesOf(calls)

				expect(queries).toHaveLength(60)
				expect(new Set(queries).size).toBe(60)
				expect(queries).toContain(
					searchQuery('2026-10-01T03:00:00Z..2026-10-01T03:00:59Z')
				)
				expect(queries).toContain(
					searchQuery('2026-10-01T03:59:00Z..2026-10-01T03:59:59Z')
				)
				expect(calls.every(call => call.variables.first === 50)).toBeTruthy()
				expect(calls.every(call => call.variables.after === null)).toBeTruthy()
				expect(events).toEqual({
					merges: [],
					stars: [],
					counts: {
						requests: 60,
						bytesDownloaded: 0,
						linesSeen: 0,
						linesPreFiltered: 0,
						eventsDecoded: 0,
						invalidLines: 0,
						ignoredEvents: 0,
						botEvents: 0,
					},
				})
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'finds a merge in the window of its second, at either window edge',
		() => {
			const { layer } = sourceOver(
				fakeGitHubSearchHandler([
					merge(1, '2026-10-01T03:00:00Z'),
					merge(2, '2026-10-01T03:00:59Z'),
					merge(3, '2026-10-01T03:01:00Z'),
					merge(4, '2026-10-01T03:59:59Z'),
					merge(5, '2026-10-01T04:00:00Z'),
					merge(6, '2026-10-01T02:59:59Z'),
				])
			)

			return Effect.gen(function* () {
				const events = yield* readHour()

				expect(
					events.merges
						.map(found => found.number)
						.toSorted((left, right) => left - right)
				).toEqual([1, 2, 3, 4])
				expect(events.counts.eventsDecoded).toBe(4)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('pages a window with the end cursor of the previous page', () => {
		const { calls, layer } = sourceOver(
			fakeGitHubSearchHandler(mergesAt('2026-10-01T03:07:30Z', 120))
		)

		return Effect.gen(function* () {
			const events = yield* readHour()
			const windowCalls = calls.filter(call =>
				String(call.variables.query).includes('03:07:00Z..')
			)

			expect(windowCalls.map(call => call.variables.after)).toEqual([
				null,
				'50',
				'100',
			])
			expect(events.merges).toHaveLength(120)
			expect(events.counts.requests).toBe(62)
		}).pipe(Effect.provide(layer))
	})

	it.effect('uses the configured page size', () => {
		const { calls, layer } = sourceOver(
			fakeGitHubSearchHandler(mergesAt('2026-10-01T03:07:30Z', 45)),
			{ pageSize: 20 }
		)

		return Effect.gen(function* () {
			expect((yield* readHour()).merges).toHaveLength(45)
			expect(calls.every(call => call.variables.first === 20)).toBeTruthy()
			expect(calls).toHaveLength(62)
		}).pipe(Effect.provide(layer))
	})

	it.effect('counts a pull request found twice once', () => {
		const repeated = merge(7, '2026-10-01T03:05:00Z')
		const sameNumberElsewhere = fakePullRequest({
			number: 7,
			mergedAt: '2026-10-01T03:05:00Z',
			repository: 'acme/gadgets',
			repositoryId: 99,
			author: 'alice',
			mergedBy: 'maintainer',
		})
		const { layer } = sourceOver(
			withExtraNodes([repeated, sameNumberElsewhere], ['05', '06'], [repeated])
		)

		return Effect.gen(function* () {
			const events = yield* readHour()

			expect(
				events.merges.map(found => `${found.repository}#${found.number}`)
			).toEqual(['acme/widgets#7', 'acme/gadgets#7'])
			expect(events.counts.eventsDecoded).toBe(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		`halves a window that reports more than ${SEARCH_RESULT_CAP} results instead of truncating it`,
		() => {
			const { calls, layer } = sourceOver(
				fakeGitHubSearchHandler([
					...mergesAt('2026-10-01T03:10:05Z', 600),
					...mergesAt('2026-10-01T03:10:45Z', 600, 1001),
				])
			)

			return Effect.gen(function* () {
				const events = yield* readHour()
				const windowQueries = queriesOf(calls).filter(query =>
					query.includes('T03:10:')
				)

				expect(events.merges).toHaveLength(1200)
				expect(new Set(windowQueries)).toEqual(
					new Set([
						searchQuery('2026-10-01T03:10:00Z..2026-10-01T03:10:59Z'),
						searchQuery('2026-10-01T03:10:00Z..2026-10-01T03:10:29Z'),
						searchQuery('2026-10-01T03:10:30Z..2026-10-01T03:10:59Z'),
					])
				)
				expect(windowQueries).toHaveLength(1 + 12 + 12)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('splits again until each window fits', () => {
		const { calls, layer } = sourceOver(
			fakeGitHubSearchHandler([
				...mergesAt('2026-10-01T03:20:01Z', 700),
				...mergesAt('2026-10-01T03:20:20Z', 700, 1001),
			])
		)

		return Effect.gen(function* () {
			expect((yield* readHour()).merges).toHaveLength(1400)
			expect(queriesOf(calls)).toContain(
				searchQuery('2026-10-01T03:20:00Z..2026-10-01T03:20:14Z')
			)
			expect(queriesOf(calls)).toContain(
				searchQuery('2026-10-01T03:20:15Z..2026-10-01T03:20:29Z')
			)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'fails the hour when a window is still too dense at the minimum length',
		() => {
			const { layer } = sourceOver(
				fakeGitHubSearchHandler(mergesAt('2026-10-01T03:30:30Z', 1001)),
				{ minWindowSeconds: 15 }
			)

			return Effect.gen(function* () {
				const error = yield* Effect.flip(readHour())

				expect(error).toMatchObject({
					_tag: 'SearchSourceError',
					date,
					hour: 3,
				})
				expect(error.message).toContain(
					'2026-10-01T03:30:30Z..2026-10-01T03:30:44Z'
				)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'excludes bots, ignores deleted authors and unresolved nodes',
		() => {
			const { layer } = sourceOver(
				withExtraNodes(
					[
						merge(1, '2026-10-01T03:00:01Z', 'alice'),
						merge(2, '2026-10-01T03:00:02Z', 'renovate[bot]'),
						fakePullRequest({
							number: 3,
							mergedAt: '2026-10-01T03:00:03Z',
							repository: 'acme/widgets',
							author: 'coderabbitai',
							authorType: 'Bot',
						}),
						merge(4, '2026-10-01T03:00:04Z', 'release-bot'),
						merge(5, '2026-10-01T03:00:05Z', null),
					],
					['00'],
					[null]
				)
			)

			return Effect.gen(function* () {
				const events = yield* readHour()

				expect(events.merges.map(found => found.author)).toEqual(['alice'])
				expect(events.counts).toMatchObject({
					eventsDecoded: 6,
					botEvents: 3,
					ignoredEvents: 2,
				})
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'classifies merges with classifyMerge from author, owner and merger',
		() => {
			const at = '2026-10-01T03:00:10Z'
			const { layer } = sourceOver(
				fakeGitHubSearchHandler([
					fakePullRequest({
						number: 1,
						mergedAt: at,
						repository: 'acme/widgets',
						author: 'Alice',
						mergedBy: 'bob',
					}),
					fakePullRequest({
						number: 2,
						mergedAt: at,
						repository: 'acme/widgets',
						author: 'Alice',
						mergedBy: 'alice',
					}),
					fakePullRequest({
						number: 3,
						mergedAt: at,
						repository: 'Alice/dotfiles',
						author: 'alice',
						mergedBy: 'alice',
					}),
					fakePullRequest({
						number: 4,
						mergedAt: at,
						repository: 'acme/widgets',
						author: 'carol',
						mergedBy: null,
					}),
				])
			)

			return Effect.gen(function* () {
				expect((yield* readHour()).merges).toEqual([
					{
						author: 'Alice',
						repository: 'acme/widgets',
						repositoryId: 12,
						owner: 'acme',
						mergedBy: 'bob',
						mergedAt: at,
						number: 1,
						mergeKind: 'merged',
					},
					expect.objectContaining({ number: 2, mergeKind: 'selfMerged' }),
					expect.objectContaining({
						number: 3,
						owner: 'Alice',
						mergeKind: 'ownRepo',
					}),
					expect.objectContaining({
						number: 4,
						mergedBy: undefined,
						mergeKind: 'merged',
					}),
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'retries a page whose query GitHub answered with errors only',
		() => {
			let failures = 2
			const search = fakeGitHubSearchHandler([merge(1, '2026-10-01T03:00:01Z')])
			const { calls, layer } = sourceOver(
				(document, variables) => {
					if (
						!String(variables.query).includes('03:00:00Z..') ||
						failures === 0
					)
						return search(document, variables)
					failures--

					return timeoutResponse
				},
				{ concurrency: 1 }
			)

			return Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(readHour())
				yield* TestClock.adjust('1 minute')

				expect((yield* Fiber.join(fiber)).merges).toHaveLength(1)
				expect(calls).toHaveLength(62)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'fails the hour after the bounded retries of a failing page',
		() => {
			const { calls, layer } = sourceOver(failingWith(504, true), {
				concurrency: 1,
			})

			return Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(Effect.flip(readHour()))
				yield* TestClock.adjust('10 minutes')
				const error = yield* Fiber.join(fiber)

				expect(error).toMatchObject({ _tag: 'SearchSourceError', hour: 3 })
				expect(error.message).toContain(
					'2026-10-01T03:00:00Z..2026-10-01T03:00:59Z: GitHub GraphQL responded 504'
				)
				expect(calls).toHaveLength(DEFAULT_SEARCH_OPTIONS.retries + 1)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('does not retry an error the client marks permanent', () => {
		const { calls, layer } = sourceOver(failingWith(401, false), {
			concurrency: 1,
		})

		return Effect.gen(function* () {
			expect(yield* Effect.flip(readHour())).toMatchObject({
				_tag: 'SearchSourceError',
			})
			expect(calls).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('reads at most `concurrency` windows at the same time', () => {
		const { probe, handler } = concurrencyProbe()
		const { layer } = sourceOver(handler, { concurrency: 3 })

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(readHour())
			yield* TestClock.adjust('2 minutes')
			yield* Fiber.join(fiber)

			expect(probe.peak).toBe(3)
		}).pipe(Effect.provide(layer))
	})
})

/** A reply of the fake GitHub HTTP endpoint: a raw failure, or the search answer. */
type HttpReply =
	| { readonly status: number; readonly html: string }
	| { readonly remaining: number }

const decodeRequestBody = Schema.decodeUnknownSync(
	Schema.fromJsonString(
		Schema.Struct({ variables: Schema.Record(Schema.String, Schema.Unknown) })
	)
)

const variablesOf = (request: HttpClientRequest.HttpClientRequest) =>
	request.body._tag === 'Uint8Array'
		? decodeRequestBody(new TextDecoder().decode(request.body.body)).variables
		: {}

/** The search source over the real GraphQL HTTP client, answering with `replies` in order, then searching `pullRequests`. */
const httpSourceOver = (
	pullRequests: readonly FakePullRequest[],
	replies: readonly HttpReply[]
) => {
	const requests: HttpClientRequest.HttpClientRequest[] = []
	const client = HttpClient.make(request =>
		Effect.sync(() => {
			const reply = replies[requests.length] ?? { remaining: 4000 }
			requests.push(request)
			if ('html' in reply)
				return HttpClientResponse.fromWeb(
					request,
					new Response(reply.html, {
						status: reply.status,
						headers: { 'content-type': 'text/html' },
					})
				)

			return HttpClientResponse.fromWeb(
				request,
				Response.json(
					toFakeSearchResponse(
						toFakeSearchPage(pullRequests, variablesOf(request)),
						reply.remaining
					)
				)
			)
		})
	)
	const layer = toGithubSearchIngestSourceLayer({ concurrency: 1 }).pipe(
		Layer.provide(toGithubGraphqlHttpLayer({ concurrency: 1 })),
		Layer.provide(
			Layer.mergeAll(
				Layer.succeed(HttpClient.HttpClient, client),
				ConfigProvider.layer(
					ConfigProvider.fromUnknown({ GITHUB_TOKEN: 'test-token' })
				)
			)
		)
	)

	return { requests, layer }
}

describe('toGithubSearchIngestSourceLayer over GitHub GraphQL HTTP', () => {
	const pullRequests = [merge(1, '2026-10-01T03:00:01Z')]

	it.effect(
		'retries a 502, a 504 and a 200 HTML page, then reads the hour',
		() => {
			const { requests, layer } = httpSourceOver(pullRequests, [
				{ status: 502, html: '<html><body>502 Bad Gateway</body></html>' },
				{ status: 504, html: '<html><body>504 Gateway Time-out</body></html>' },
				{ status: 200, html: '<!DOCTYPE html><title>Unicorn!</title>' },
			])

			return Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(readHour())
				yield* TestClock.adjust('1 minute')
				const events = yield* Fiber.join(fiber)

				expect(events.merges.map(found => found.number)).toEqual([1])
				expect(events.counts.requests).toBe(60)
				expect(requests).toHaveLength(63)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('waits until resetAt when few points remain', () => {
		const { requests, layer } = httpSourceOver(pullRequests, [
			{ remaining: MIN_REMAINING_POINTS - 1 },
		])

		return Effect.gen(function* () {
			yield* TestClock.setTime(Date.parse('2026-10-01T03:50:00Z'))
			const fiber = yield* Effect.forkChild(readHour())
			yield* TestClock.adjust('9 minutes')
			expect(requests).toHaveLength(1)

			yield* TestClock.adjust('1 minute')
			yield* TestClock.adjust('2 seconds')
			expect((yield* Fiber.join(fiber)).merges).toHaveLength(1)
			expect(requests).toHaveLength(60)
		}).pipe(Effect.provide(layer))
	})
})

const parseConcurrency = (env: Record<string, string>) =>
	searchConcurrencyConfig.parse(ConfigProvider.fromEnvRecord(env))

describe('searchConcurrencyConfig', () => {
	it.effect(
		'defaults to DEFAULT_SEARCH_OPTIONS.concurrency and reads SEARCH_CONCURRENCY',
		() =>
			Effect.gen(function* () {
				expect(yield* parseConcurrency({})).toBe(
					DEFAULT_SEARCH_OPTIONS.concurrency
				)
				expect(yield* parseConcurrency({ SEARCH_CONCURRENCY: '5' })).toBe(5)
			})
	)

	it.effect.each(['0', '1.5', 'many'])('rejects SEARCH_CONCURRENCY=%s', value =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip(parseConcurrency({ SEARCH_CONCURRENCY: value }))
			).toMatchObject({ _tag: 'ConfigError' })
		})
	)
})
