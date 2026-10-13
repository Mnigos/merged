import { isoDateTimeSchema } from '@shared/schema/iso-date-time.schema'
import { seasonIdSchema } from '@shared/schema/season-id.schema'
import { Schema } from 'effect'
import { mergeResolutionSchema } from '../merge-resolution.helper'

/** `seasons/<id>/mergers.json`: merge resolutions keyed by `owner/name#number`. */
export const mergersFileSchema = Schema.Struct({
	season: seasonIdSchema,
	updatedAt: isoDateTimeSchema,
	pullRequests: Schema.Record(Schema.String, mergeResolutionSchema),
})
export type MergersFile = typeof mergersFileSchema.Type
