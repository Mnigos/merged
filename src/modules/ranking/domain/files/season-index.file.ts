import { isoDateSchema } from '@shared/schema/iso-date.schema'
import { seasonIdSchema } from '@shared/schema/season-id.schema'
import { Schema } from 'effect'
import {
	computedAtSchema,
	countrySummarySchema,
	countSchema,
} from './file-fields.schema'

export const seasonStatusSchema = Schema.Literals(['provisional', 'final'])
export type SeasonStatus = typeof seasonStatusSchema.Type

/** One season in `seasons/index.json`. */
export const seasonIndexEntrySchema = Schema.Struct({
	id: seasonIdSchema,
	status: seasonStatusSchema,
	/** Days of the month with a daily aggregate. */
	daysIncluded: countSchema,
	daysInMonth: countSchema,
	/** Days already over (before the recompute's UTC day) without a daily aggregate. */
	missingDays: Schema.Array(isoDateSchema),
	computedAt: computedAtSchema,
	/** Contributors ranked on the Global board. */
	contributors: countSchema,
	/** Repositories with at least one merged pull request from outside. */
	repositories: countSchema,
	/** Merged and self-merged pull requests, own-repo excluded. */
	mergedPullRequests: countSchema,
	/** Logins excluded as bots; absent in indexes written before it was added. */
	excludedBots: Schema.optional(countSchema),
	/** Countries with a board, most contributors first; absent in indexes written before country boards. */
	countries: Schema.optional(Schema.Array(countrySummarySchema)),
})
export type SeasonIndexEntry = typeof seasonIndexEntrySchema.Type

/** `seasons/index.json`: every computed season, newest first. */
export const seasonIndexSchema = Schema.Struct({
	latest: Schema.NullOr(seasonIdSchema),
	seasons: Schema.Array(seasonIndexEntrySchema),
})
export type SeasonIndex = typeof seasonIndexSchema.Type
