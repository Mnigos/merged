import { isoDateTimeSchema } from '@shared/schema/iso-date-time.schema'
import { seasonIdSchema } from '@shared/schema/season-id.schema'
import { Schema } from 'effect'
import { contributorProfileSchema } from '../contributor-profile.model'

/** `seasons/<id>/profiles.json`: candidate profiles keyed by lowercase login. */
export const contributorsFileSchema = Schema.Struct({
	season: seasonIdSchema,
	updatedAt: isoDateTimeSchema,
	contributors: Schema.Record(Schema.String, contributorProfileSchema),
})
export type ContributorsFile = typeof contributorsFileSchema.Type
