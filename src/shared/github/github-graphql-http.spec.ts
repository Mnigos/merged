import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Duration, Effect, Fiber, Layer } from 'effect'
import {
	HttpClient,
	type HttpClientRequest,
	HttpClientResponse,
} from 'effect/http'
import { TestClock } from 'effect/testing'
import {
	DEFAULT_RATE_LIMIT_WAIT,
	GITHUB_GRAPHQL_URL,
	githubGraphqlHttpLayer,
	MIN_REMAINING_POINTS,
	redactSecrets,
	REQUEST_RETRIES,
} from './github-graphql-http'
import { GitHubGraphql } from './github-graphql.port'

interface ScriptedResponse {
	readonly delay?: Duration.Input
	readonly status?: number
	readonly body?: unknown
	readonly headers?: Readonly<Record<string, string>>
}

const okBody = (remaining = 4000, data: Record<string, unknown> = {}) => ({
	data: {
		...data,
		rateLimit: {
			cost: 1,
			remaining,
			resetAt: new Date(10 * 60 * 1000).toISOString(),
		},
	},
})

const graphqlWith = (responses: readonly ScriptedResponse[]) => {
	const requests: HttpClientRequest.HttpClientRequest[] = []
	const client = HttpClient.make(request =>
		Effect.gen(function* () {
			const {
				delay = '0 millis',
				status = 200,
				body = okBody(),
				headers = {},
			} = responses[requests.length] ?? {}
			requests.push(request)
			yield* Effect.sleep(delay)

			return HttpClientResponse.fromWeb(
				request,
				Response.json(body, { status, headers })
			)
		})
	)
	const layer = githubGraphqlHttpLayer.pipe(
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

const query = (variables: Record<string, unknown> = {}) =>
	Effect.gen(function* () {
		const graphql = yield* GitHubGraphql

		return yield* graphql.query('query { viewer { login } }', variables)
	})

describe('githubGraphqlHttpLayer', () => {
	it.effect(
		'posts the query with the token and returns data and errors',
		() => {
			const { requests, layer } = graphqlWith([
				{
					body: {
						data: { a0: null, a1: { login: 'alice' } },
						errors: [
							{
								type: 'NOT_FOUND',
								path: ['a0'],
								message: 'Could not resolve',
								locations: [],
							},
						],
					},
				},
			])

			return Effect.gen(function* () {
				expect(yield* query({ login0: 'ghost' })).toEqual({
					data: { a0: null, a1: { login: 'alice' } },
					errors: [
						{ type: 'NOT_FOUND', path: ['a0'], message: 'Could not resolve' },
					],
				})
				const [request] = requests
				expect(request?.url).toBe(GITHUB_GRAPHQL_URL)
				expect(request?.method).toBe('POST')
				expect(request?.headers).toMatchObject({
					authorization: 'Bearer test-token',
					'user-agent': 'merged',
				})
				expect(
					request?.body._tag === 'Uint8Array' &&
						JSON.parse(new TextDecoder().decode(request.body.body))
				).toEqual({
					query: 'query { viewer { login } }',
					variables: { login0: 'ghost' },
				})
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect.each([500, 502, 503, 504])('retries a %d with backoff', status => {
		const { requests, layer } = graphqlWith([{ status }])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(query())
			yield* TestClock.adjust('799 millis')
			expect(requests).toHaveLength(1)
			yield* TestClock.adjust('402 millis')

			expect(yield* Fiber.join(fiber)).toMatchObject({ errors: [] })
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect('gives up after the bounded number of retries', () => {
		const { requests, layer } = graphqlWith(
			Array.from({ length: REQUEST_RETRIES + 1 }, () => ({ status: 503 }))
		)

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(Effect.flip(query()))
			yield* TestClock.adjust('10 minutes')

			expect(yield* Fiber.join(fiber)).toMatchObject({
				_tag: 'GitHubGraphqlError',
				status: 503,
				retryable: true,
			})
			expect(requests).toHaveLength(REQUEST_RETRIES + 1)
		}).pipe(Effect.provide(layer))
	})

	it.effect.each([401, 400])('does not retry a %d', status => {
		const { requests, layer } = graphqlWith([
			{ status, body: { message: 'Bad credentials' } },
		])

		return Effect.gen(function* () {
			expect(yield* Effect.flip(query())).toMatchObject({
				_tag: 'GitHubGraphqlError',
				status,
				retryable: false,
			})
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('does not retry a 403 that is not a rate limit', () => {
		const { requests, layer } = graphqlWith([{ status: 403 }])

		return Effect.gen(function* () {
			expect(yield* Effect.flip(query())).toMatchObject({
				status: 403,
				retryable: false,
			})
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('waits until x-ratelimit-reset when the budget is spent', () => {
		const { requests, layer } = graphqlWith([
			{
				status: 403,
				headers: {
					'x-ratelimit-remaining': '0',
					'x-ratelimit-reset': '300',
				},
			},
		])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(query())
			yield* TestClock.adjust('299999 millis')
			expect(requests).toHaveLength(1)

			yield* TestClock.adjust('2202 millis')
			expect(yield* Fiber.join(fiber)).toMatchObject({ errors: [] })
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect.each([403, 429])('waits for retry-after on a %d', status => {
		const { requests, layer } = graphqlWith([
			{ status, headers: { 'retry-after': '120' } },
		])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(query())
			yield* TestClock.adjust('119999 millis')
			expect(requests).toHaveLength(1)

			yield* TestClock.adjust('1202 millis')
			expect(yield* Fiber.join(fiber)).toMatchObject({ errors: [] })
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect('retries a RATE_LIMITED GraphQL error', () => {
		const { requests, layer } = graphqlWith([
			{
				body: {
					data: null,
					errors: [
						{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' },
					],
				},
			},
		])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(query())
			yield* TestClock.adjust('59999 millis')
			expect(requests).toHaveLength(1)
			yield* TestClock.adjust('1202 millis')

			expect(yield* Fiber.join(fiber)).toMatchObject({ errors: [] })
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'pauses the next query until resetAt when few points remain',
		() => {
			const { requests, layer } = graphqlWith([
				{ body: okBody(MIN_REMAINING_POINTS - 1) },
			])

			return Effect.gen(function* () {
				yield* query()
				const fiber = yield* Effect.forkChild(query())
				yield* TestClock.adjust('599999 millis')
				expect(requests).toHaveLength(1)

				yield* TestClock.adjust('1001 millis')
				yield* Fiber.join(fiber)
				expect(requests).toHaveLength(2)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('does not pause while enough points remain', () => {
		const { requests, layer } = graphqlWith([
			{ body: okBody(MIN_REMAINING_POINTS) },
		])

		return Effect.gen(function* () {
			yield* query()
			yield* query()

			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'serializes concurrent queries while an HTTP response is pending',
		() => {
			const { requests, layer } = graphqlWith([
				{ delay: '10 seconds', body: okBody(4000, { marker: 'first' }) },
				{ delay: '10 seconds', body: okBody(4000, { marker: 'second' }) },
			])

			return Effect.gen(function* () {
				const first = yield* Effect.forkChild(query({ id: 1 }))
				yield* TestClock.adjust('1 millis')
				const second = yield* Effect.forkChild(query({ id: 2 }))
				yield* TestClock.adjust('9998 millis')
				expect(requests).toHaveLength(1)
				yield* TestClock.adjust('1 millis')
				expect(yield* Fiber.join(first)).toMatchObject({
					data: { marker: 'first' },
				})
				yield* TestClock.adjust('1 millis')
				expect(requests).toHaveLength(2)
				yield* TestClock.adjust('10 seconds')
				expect(yield* Fiber.join(second)).toMatchObject({
					data: { marker: 'second' },
				})
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'keeps the authorization token out of ordinary status errors',
		() => {
			const { layer } = graphqlWith([
				{ status: 401, body: { message: 'Bad credentials' } },
			])

			return Effect.gen(function* () {
				const error = yield* Effect.flip(query())
				expect(error).toMatchObject({ _tag: 'GitHubGraphqlError', status: 401 })
				expect(error.message).not.toContain('test-token')
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('redacts a token echoed in an HTTP error body', () => {
		const { layer } = graphqlWith([
			{ status: 401, body: { message: 'Rejected Bearer test-token' } },
		])

		return Effect.gen(function* () {
			const error = yield* Effect.flip(query())
			expect(error).toMatchObject({ _tag: 'GitHubGraphqlError', status: 401 })
			expect(error.message).not.toContain('test-token')
		}).pipe(Effect.provide(layer))
	})
	it.effect('waits the default time on a 429 without retry-after', () => {
		const { requests, layer } = graphqlWith([{ status: 429 }])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(query())
			yield* TestClock.adjust(
				Duration.subtract(DEFAULT_RATE_LIMIT_WAIT, Duration.seconds(1))
			)
			expect(requests).toHaveLength(1)

			yield* TestClock.adjust('1 minute')
			expect(yield* Fiber.join(fiber)).toMatchObject({ errors: [] })
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'retries a secondary rate limit 403 while points remain, with bounded attempts',
		() => {
			const secondary = {
				status: 403,
				body: {
					message:
						'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
				},
				headers: { 'x-ratelimit-remaining': '4000' },
			}
			const { requests, layer } = graphqlWith(
				Array.from({ length: REQUEST_RETRIES + 1 }, () => secondary)
			)

			return Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(Effect.flip(query()))
				yield* TestClock.adjust(
					Duration.subtract(DEFAULT_RATE_LIMIT_WAIT, Duration.seconds(1))
				)
				expect(requests).toHaveLength(1)

				yield* TestClock.adjust('1 hour')
				expect(yield* Fiber.join(fiber)).toMatchObject({
					_tag: 'GitHubGraphqlError',
					status: 403,
					retryable: true,
				})
				expect(requests).toHaveLength(REQUEST_RETRIES + 1)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('succeeds after a secondary rate limit 403 clears', () => {
		const { requests, layer } = graphqlWith([
			{
				status: 403,
				body: { message: 'abuse detection mechanism triggered' },
			},
		])

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(query())
			yield* TestClock.adjust('2 minutes')

			expect(yield* Fiber.join(fiber)).toMatchObject({ errors: [] })
			expect(requests).toHaveLength(2)
		}).pipe(Effect.provide(layer))
	})

	it.effect.each([
		'Resource not accessible by integration',
		'Resource protected by organization SAML enforcement.',
	])('does not retry a permission 403: %s', message => {
		const { requests, layer } = graphqlWith([
			{
				status: 403,
				body: { message },
				headers: { 'x-ratelimit-remaining': '4000' },
			},
		])

		return Effect.gen(function* () {
			expect(yield* Effect.flip(query())).toMatchObject({
				status: 403,
				retryable: false,
			})
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it('redacts the token, bearer values and GitHub token shapes', () => {
		expect(
			redactSecrets(
				'secret-123 Bearer abc token xyz ghp_AbC123 github_pat_11AB_cd',
				'secret-123'
			)
		).toBe('[redacted] [redacted] [redacted] [redacted] [redacted]')
	})
})
