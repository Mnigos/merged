import { githubTokenConfig } from '@shared/config/github-token'
import {
	Clock,
	Duration,
	Effect,
	Layer,
	Option,
	Redacted,
	Ref,
	Schedule,
	Schema,
	Semaphore,
} from 'effect'
import {
	HttpClient,
	HttpClientRequest,
	type HttpClientResponse,
} from 'effect/http'
import { graphqlRateLimitSchema } from './github-graphql-rate-limit'
import { GitHubGraphqlError } from './github-graphql.error'
import { GitHubGraphql, type GraphqlResponse } from './github-graphql.port'
import {
	DEFAULT_RATE_LIMIT_WAIT,
	toRateLimitWaitMs,
	toRejectionWaitMs,
	waitForRateLimit,
} from './rate-limit-wait'
import { redactSecrets } from './redact-secrets'

/** GitHub GraphQL endpoint. */
export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

/** Retries of a transient or rate-limited query before it fails. */
export const REQUEST_RETRIES = 5

/** Points left in the hourly budget below which the next query waits for `resetAt`. */
export const MIN_REMAINING_POINTS = 100

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504])

const envelopeSchema = Schema.Struct({
	data: Schema.optional(Schema.Unknown),
	errors: Schema.optional(
		Schema.Array(
			Schema.Struct({
				message: Schema.String,
				type: Schema.optional(Schema.String),
				path: Schema.optional(
					Schema.Array(Schema.Union([Schema.String, Schema.Number]))
				),
			})
		)
	),
})
const decodeEnvelope = Schema.decodeUnknownEffect(envelopeSchema)
const decodeRateLimit = Schema.decodeUnknownOption(
	Schema.Struct({ rateLimit: graphqlRateLimitSchema })
)

const readBody = (response: HttpClientResponse.HttpClientResponse) =>
	response.text.pipe(Effect.orElseSucceed(() => ''))

const makeGithubGraphqlHttp = (concurrency: number) =>
	Effect.gen(function* () {
		const token = yield* githubTokenConfig
		const client = yield* HttpClient.HttpClient
		const semaphore = yield* Semaphore.make(concurrency)
		const pausedUntil = yield* Ref.make(0)

		const secret = Redacted.value(token)
		const toStatusError = (status: number, body: string, retryable: boolean) =>
			new GitHubGraphqlError({
				message: `GitHub GraphQL responded ${status}: ${redactSecrets(body.slice(0, 200), secret)}`,
				status,
				retryable,
			})

		const send = Effect.fn('GitHubGraphql.send')(function* (
			document: string,
			variables: Readonly<Record<string, unknown>>
		) {
			const request = HttpClientRequest.post(GITHUB_GRAPHQL_URL).pipe(
				HttpClientRequest.bearerToken(token),
				HttpClientRequest.setHeader('user-agent', 'merged'),
				HttpClientRequest.bodyJsonUnsafe({ query: document, variables })
			)
			const response = yield* client.execute(request).pipe(
				Effect.mapError(
					error =>
						new GitHubGraphqlError({
							message: `GitHub GraphQL request failed: ${redactSecrets(error.message, secret)}`,
							retryable: error.reason._tag === 'TransportError',
						})
				)
			)
			const nowMs = yield* Clock.currentTimeMillis

			if (response.status === 403 || response.status === 429) {
				const body = yield* readBody(response)
				const waitMs = toRejectionWaitMs(response, body, nowMs)
				if (waitMs === undefined)
					return yield* Effect.fail(toStatusError(response.status, body, false))
				yield* waitForRateLimit(waitMs, response.status)

				return yield* Effect.fail(toStatusError(response.status, body, true))
			}
			if (response.status !== 200)
				return yield* Effect.fail(
					toStatusError(
						response.status,
						yield* readBody(response),
						RETRYABLE_STATUSES.has(response.status)
					)
				)

			const body = yield* response.json.pipe(
				Effect.flatMap(decodeEnvelope),
				Effect.mapError(
					error =>
						new GitHubGraphqlError({
							message: `GitHub GraphQL returned an unreadable body: ${redactSecrets(error.message, secret)}`,
							status: response.status,
							retryable: true,
						})
				)
			)
			const errors = body.errors ?? []
			if (errors.some(error => error.type === 'RATE_LIMITED')) {
				yield* waitForRateLimit(
					toRateLimitWaitMs(response, nowMs) ??
						Duration.toMillis(DEFAULT_RATE_LIMIT_WAIT)
				)

				return yield* Effect.fail(
					new GitHubGraphqlError({
						message: 'GitHub GraphQL rate limit exceeded',
						status: response.status,
						retryable: true,
					})
				)
			}

			return { data: body.data ?? null, errors } satisfies GraphqlResponse
		})

		const pauseIfExhausted = Effect.fn('GitHubGraphql.pauseIfExhausted')(
			function* (response: GraphqlResponse) {
				const rateLimit = decodeRateLimit(response.data)
				if (
					Option.isNone(rateLimit) ||
					rateLimit.value.rateLimit.remaining >= MIN_REMAINING_POINTS
				)
					return

				const { remaining, resetAt } = rateLimit.value.rateLimit
				yield* Ref.set(pausedUntil, Date.parse(resetAt) + 1000)
				yield* Effect.logInfo(
					'GitHub points almost spent, pausing until reset'
				).pipe(Effect.annotateLogs({ remaining, resetAt }))
			}
		)

		const query = Effect.fn('GitHubGraphql.query')(function* (
			document: string,
			variables: Readonly<Record<string, unknown>>
		) {
			return yield* semaphore.withPermits(1)(
				Effect.gen(function* () {
					const waitMs =
						(yield* Ref.get(pausedUntil)) - (yield* Clock.currentTimeMillis)
					if (waitMs > 0) yield* Effect.sleep(Duration.millis(waitMs))

					const response = yield* send(document, variables).pipe(
						Effect.retry({
							schedule: Schedule.exponential('1 second').pipe(
								Schedule.jittered
							),
							times: REQUEST_RETRIES,
							while: error => error.retryable,
						})
					)
					yield* pauseIfExhausted(response)

					return response
				})
			)
		})

		return { query }
	})

export interface GithubGraphqlHttpOptions {
	/** Queries in flight at once; the others wait for a free slot. */
	readonly concurrency: number
}

/**
 * `GitHubGraphql` over HTTP with `GITHUB_TOKEN`, at most `concurrency`
 * queries in flight. A query is retried with exponential backoff on 5xx,
 * network errors, unreadable (non-JSON) bodies and rate limits (after
 * waiting for `retry-after`, `x-ratelimit-reset`, or
 * `DEFAULT_RATE_LIMIT_WAIT` for a 429 or a secondary-limit 403), never on
 * 400, 401 or a permission 403. Error messages never carry the token. When a
 * response's `rateLimit.remaining` drops below `MIN_REMAINING_POINTS`, the
 * next queries wait until `resetAt`.
 */
export const toGithubGraphqlHttpLayer = ({
	concurrency,
}: GithubGraphqlHttpOptions) =>
	Layer.effect(GitHubGraphql, makeGithubGraphqlHttp(concurrency))

/** `toGithubGraphqlHttpLayer` one query at a time; batching provides the throughput. */
export const githubGraphqlHttpLayer = toGithubGraphqlHttpLayer({
	concurrency: 1,
})
