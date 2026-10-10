import { githubLoginSchema } from '@shared/schema/github-login'
import { seasonIdSchema } from '@shared/schema/season-id'
import { Schema } from 'effect'
import { computedAtSchema } from './file-fields'

export const candidatePullRequestSchema = Schema.Struct({
	repository: Schema.String,
	number: Schema.Int,
	author: githubLoginSchema,
})
export type CandidatePullRequest = typeof candidatePullRequestSchema.Type

/** `seasons/<id>/candidates.json`: what scoring pass 1 asks enrichment to fetch. */
export const candidatesFileSchema = Schema.Struct({
	season: seasonIdSchema,
	computedAt: computedAtSchema,
	contributors: Schema.Array(githubLoginSchema),
	/** Every repository of the season, sorted, independent of the contributor limit; enrichment fetches real stars for all of them. */
	repositories: Schema.Array(Schema.String),
	/** The candidates' merged pull requests whose merger is unknown. */
	pullRequests: Schema.Array(candidatePullRequestSchema),
})
export type CandidatesFile = typeof candidatesFileSchema.Type
