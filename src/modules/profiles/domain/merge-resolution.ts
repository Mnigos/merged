import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateTimeSchema } from '@shared/schema/iso-date-time'
import { Schema } from 'effect'

/** Who merged one of the candidates' merged pull requests. */
export const mergeResolutionSchema = Schema.Struct({
	/** Lowercase `owner/name`. */
	repository: Schema.String,
	number: Schema.Int,
	/** Lowercase login of the merger; `null` when unknown (deleted account) or the pull request was not found. */
	mergedBy: Schema.NullOr(githubLoginSchema),
	fetchedAt: isoDateTimeSchema,
})
export type MergeResolution = typeof mergeResolutionSchema.Type

/** Key of a merge resolution in `mergers.json`: `owner/name#number`. */
export const toMergeResolutionKey = (repository: string, number: number) =>
	`${repository}#${number}`
