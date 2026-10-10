import { Schema } from 'effect'

const ISO_DATETIME_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/u

/** A non-negative whole number. */
export const countSchema = Schema.Int.pipe(
	Schema.check(Schema.isGreaterThanOrEqualTo(0))
)

/** A 1-based competition rank. */
export const rankSchema = Schema.Int.pipe(
	Schema.check(Schema.isGreaterThanOrEqualTo(1))
)

/** Share of scored contributors with a strictly lower score, 0–100, one decimal. */
export const percentileSchema = Schema.Number.pipe(
	Schema.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
)

/** An integer score, see `scoreBreakdown` in `scoring.ts`. */
export const scoreSchema = Schema.Int.pipe(
	Schema.check(Schema.isGreaterThanOrEqualTo(0))
)

/** UTC instant of the recompute that wrote a file, `Date#toISOString` format. */
export const computedAtSchema = Schema.String.pipe(
	Schema.check(Schema.isPattern(ISO_DATETIME_PATTERN))
)
