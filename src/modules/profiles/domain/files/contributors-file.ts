import { isoDateTimeSchema } from '@shared/schema/iso-date-time'
import { seasonIdSchema } from '@shared/schema/season-id'
import { Schema } from 'effect'
import { contributorProfileSchema } from '../contributor-profile'

/** `seasons/<id>/profiles.json`: candidate profiles keyed by lowercase login. */
export const contributorsFileSchema = Schema.Struct({
	season: seasonIdSchema,
	updatedAt: isoDateTimeSchema,
	contributors: Schema.Record(Schema.String, contributorProfileSchema),
})
export type ContributorsFile = typeof contributorsFileSchema.Type
