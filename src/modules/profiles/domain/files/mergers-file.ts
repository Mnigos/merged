import { isoDateTimeSchema } from '@shared/schema/iso-date-time'
import { seasonIdSchema } from '@shared/schema/season-id'
import { Schema } from 'effect'
import { mergeResolutionSchema } from '../merge-resolution'

/** `seasons/<id>/mergers.json`: merge resolutions keyed by `owner/name#number`. */
export const mergersFileSchema = Schema.Struct({
	season: seasonIdSchema,
	updatedAt: isoDateTimeSchema,
	pullRequests: Schema.Record(Schema.String, mergeResolutionSchema),
})
export type MergersFile = typeof mergersFileSchema.Type
