import { githubLoginSchema } from '@shared/schema/github-login'
import { seasonIdSchema } from '@shared/schema/season-id'
import { Schema } from 'effect'
import {
	computedAtSchema,
	countSchema,
	percentileSchema,
	rankSchema,
	scoreSchema,
} from './file-fields'

/** `bot`, or `noCountedRepository` when none of the contributor's repositories counts yet. */
export const exclusionSchema = Schema.Literals(['bot', 'noCountedRepository'])
export type ShardExclusion = typeof exclusionSchema.Type

export const shardRepositorySchema = Schema.Struct({
	repository: Schema.String,
	/** Merged by someone else. */
	mergedPullRequests: countSchema,
	selfMergedPullRequests: countSchema,
	/** Repository standing used as the popularity input of the score. */
	standing: countSchema,
	/** Whether the repository counts towards the score; an uncounted one scores 0. */
	counted: Schema.Boolean,
	score: scoreSchema,
})
export type ShardRepository = typeof shardRepositorySchema.Type

export const shardEntrySchema = Schema.Struct({
	login: githubLoginSchema,
	/** Global rank; null when the contributor is excluded. */
	rank: Schema.NullOr(rankSchema),
	/** Season percentile; null when the contributor is excluded. */
	percentile: Schema.NullOr(percentileSchema),
	score: scoreSchema,
	mergedPullRequests: countSchema,
	selfMergedPullRequests: countSchema,
	boards: Schema.Struct({ poland: Schema.NullOr(rankSchema) }),
	/** Every repository the contributor merged into: counted first, then by score. */
	repositories: Schema.Array(shardRepositorySchema),
	name: Schema.NullOr(Schema.String),
	location: Schema.NullOr(Schema.String),
	/** Why the contributor is not ranked, or null when ranked. */
	excluded: Schema.NullOr(exclusionSchema),
})
export type ShardEntry = typeof shardEntrySchema.Type

/** `seasons/<id>/shards/<xx>.json`: every contributor whose login hashes to the shard. */
export const shardFileSchema = Schema.Struct({
	season: seasonIdSchema,
	computedAt: computedAtSchema,
	/** Keyed by lowercase login. */
	entries: Schema.Record(Schema.String, shardEntrySchema),
})
export type ShardFile = typeof shardFileSchema.Type
