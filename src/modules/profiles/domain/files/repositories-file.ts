import { isoDateTimeSchema } from '@shared/schema/iso-date-time'
import { seasonIdSchema } from '@shared/schema/season-id'
import { Schema } from 'effect'
import { repositoryProfileSchema } from '../repository-profile'

/** `seasons/<id>/repos.json`: real stars and language per repository, keyed by lowercase `owner/name`. */
export const repositoriesFileSchema = Schema.Struct({
	season: seasonIdSchema,
	updatedAt: isoDateTimeSchema,
	repositories: Schema.Record(Schema.String, repositoryProfileSchema),
})
export type RepositoriesFile = typeof repositoriesFileSchema.Type
