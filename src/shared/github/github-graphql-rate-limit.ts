import { Schema } from 'effect'

/** Selection every query document includes so callers and the adapter see the cost. */
export const RATE_LIMIT_FIELD = 'rateLimit { cost remaining resetAt }'

/** The `rateLimit` object GitHub returns for `RATE_LIMIT_FIELD`. */
export const graphqlRateLimitSchema = Schema.Struct({
	cost: Schema.Number,
	remaining: Schema.Number,
	resetAt: Schema.String,
})
export type GraphqlRateLimit = typeof graphqlRateLimitSchema.Type
