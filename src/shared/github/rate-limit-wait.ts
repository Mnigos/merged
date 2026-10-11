import { Duration, Effect, Option } from 'effect'
import { Headers, type HttpClientResponse } from 'effect/http'

/** Wait when GitHub reports a rate limit without saying until when. */
export const DEFAULT_RATE_LIMIT_WAIT = Duration.minutes(1)

/** A 403 body GitHub sends for its secondary (abuse) rate limit, not for missing permissions. */
const SECONDARY_RATE_LIMIT = /secondary rate limit|abuse/iu

const readHeader = (
	response: HttpClientResponse.HttpClientResponse,
	name: string
) => Option.getOrUndefined(Headers.get(response.headers, name))

/**
 * How long to wait before retrying a rate-limited GitHub response:
 * `retry-after` seconds, or until `x-ratelimit-reset` when
 * `x-ratelimit-remaining` is 0; `undefined` when the response does not say it
 * is rate limited.
 */
export function toRateLimitWaitMs(
	response: HttpClientResponse.HttpClientResponse,
	nowMs: number
) {
	const retryAfter = Number(readHeader(response, 'retry-after'))
	if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000
	if (readHeader(response, 'x-ratelimit-remaining') !== '0') return undefined

	const resetSeconds = Number(readHeader(response, 'x-ratelimit-reset'))
	if (!Number.isFinite(resetSeconds))
		return Duration.toMillis(DEFAULT_RATE_LIMIT_WAIT)

	return Math.max(0, resetSeconds * 1000 - nowMs) + 1000
}

/**
 * Wait before retrying a GitHub 403 or 429: what the headers say (see
 * `toRateLimitWaitMs`), else `DEFAULT_RATE_LIMIT_WAIT` for a 429 or a 403
 * about the secondary rate limit; `undefined` for a 403 about permissions.
 */
export function toRejectionWaitMs(
	response: HttpClientResponse.HttpClientResponse,
	body: string,
	nowMs: number
) {
	const waitMs = toRateLimitWaitMs(response, nowMs)
	if (waitMs !== undefined) return waitMs
	if (response.status === 429 || SECONDARY_RATE_LIMIT.test(body))
		return Duration.toMillis(DEFAULT_RATE_LIMIT_WAIT)

	return undefined
}

/** Logs a GitHub rate limit and sleeps `waitMs`. */
export const waitForRateLimit = (waitMs: number, status?: number) =>
	Effect.logInfo('GitHub rate limit reached, waiting').pipe(
		Effect.annotateLogs({ status, seconds: Math.ceil(waitMs / 1000) }),
		Effect.andThen(Effect.sleep(Duration.millis(waitMs)))
	)
