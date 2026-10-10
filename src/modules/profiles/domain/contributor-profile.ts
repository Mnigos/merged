import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateTimeSchema } from '@shared/schema/iso-date-time'
import { Schema } from 'effect'

/** What enrichment knows about a candidate contributor. */
export const contributorProfileSchema = Schema.Struct({
	/** Lowercase login. */
	login: githubLoginSchema,
	name: Schema.NullOr(Schema.String),
	/** Free-text GitHub location, input of the Poland board. */
	location: Schema.NullOr(Schema.String),
	company: Schema.NullOr(Schema.String),
	avatarUrl: Schema.NullOr(Schema.String),
	fetchedAt: isoDateTimeSchema,
	/** GitHub has no user with this login: deleted, renamed, or an app (bots are not users). */
	missing: Schema.Boolean,
})
export type ContributorProfile = typeof contributorProfileSchema.Type
