import { isoDateTimeSchema } from '@shared/schema/iso-date-time'
import { Schema } from 'effect'

/** What enrichment knows about a repository of the season. */
export const repositoryProfileSchema = Schema.Struct({
	/** Lowercase `owner/name` as the season knows it. */
	repository: Schema.String,
	stars: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
	language: Schema.NullOr(Schema.String),
	fetchedAt: isoDateTimeSchema,
	/** GitHub did not find it: deleted, renamed away or private. Stars are 0. */
	missing: Schema.Boolean,
})
export type RepositoryProfile = typeof repositoryProfileSchema.Type
