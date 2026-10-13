import { githubLoginSchema } from '@shared/schema/github-login.schema'
import { seasonIdSchema } from '@shared/schema/season-id.schema'
import { Schema } from 'effect'
import {
	computedAtSchema,
	countrySummarySchema,
	countSchema,
	percentileSchema,
	rankSchema,
	scoreSchema,
} from './file-fields.schema'

/** A contributor board: Global, or the board of one country. */
export const contributorBoardIdSchema = Schema.Literals(['global', 'country'])
export type ContributorBoardId = typeof contributorBoardIdSchema.Type

/** Name of a contributor board file: `global`, or `country-<code>` such as `country-pl`. */
export type ContributorBoardKey = 'global' | `country-${string}`

/** File name of a country's board, `pl` → `country-pl`. */
export const toCountryBoardKey = (code: string): ContributorBoardKey =>
	`country-${code}`

/** One of a contributor's best repositories on a board row. */
export const topRepositorySchema = Schema.Struct({
	repository: Schema.String,
	/** All merged pull requests into the repository, self-merged included. */
	mergedPullRequests: countSchema,
	/** Whether the repository counts towards the score; an uncounted one scores 0. */
	counted: Schema.Boolean,
	score: scoreSchema,
})
export type TopRepository = typeof topRepositorySchema.Type

export const boardRowSchema = Schema.Struct({
	/** Rank on this board; equal scores share a rank. */
	rank: rankSchema,
	login: githubLoginSchema,
	score: scoreSchema,
	/** Season percentile, the same on every board. */
	percentile: percentileSchema,
	/** Merged by someone else. */
	mergedPullRequests: countSchema,
	selfMergedPullRequests: countSchema,
	repositories: countSchema,
	/** Up to three repositories, counted ones first, then by score. */
	topRepositories: Schema.Array(topRepositorySchema),
	name: Schema.NullOr(Schema.String),
	location: Schema.NullOr(Schema.String),
})
export type BoardRow = typeof boardRowSchema.Type

/** `seasons/<id>/tabs/global.json` and `tabs/country-<code>.json`: the top 100 of a contributor board. */
export const boardFileSchema = Schema.Struct({
	season: seasonIdSchema,
	board: contributorBoardIdSchema,
	/** The board's country; present on country boards only. */
	country: Schema.optional(countrySummarySchema),
	computedAt: computedAtSchema,
	/** Contributors ranked on this board in total, not only the rows. */
	contributors: countSchema,
	rows: Schema.Array(boardRowSchema),
})
export type BoardFile = typeof boardFileSchema.Type

/** File name of a board file: `global`, or `country-<code>` for a country board. */
export const toBoardKey = (file: BoardFile): ContributorBoardKey =>
	file.country ? toCountryBoardKey(file.country.code) : 'global'

export const repositoryBoardRowSchema = Schema.Struct({
	rank: rankSchema,
	repository: Schema.String,
	/** Distinct outside contributors in the season. */
	contributors: countSchema,
	/** All merged pull requests from outside contributors, self-merged included. */
	mergedPullRequests: countSchema,
	starsInSeason: countSchema,
	/** Real stars from enrichment; null before enrichment. */
	stars: Schema.NullOr(countSchema),
	language: Schema.NullOr(Schema.String),
})
export type RepositoryBoardRow = typeof repositoryBoardRowSchema.Type

/** `seasons/<id>/tabs/repositories.json`: the top 100 repositories by contributors. */
export const repositoryBoardFileSchema = Schema.Struct({
	season: seasonIdSchema,
	board: Schema.Literal('repositories'),
	computedAt: computedAtSchema,
	rows: Schema.Array(repositoryBoardRowSchema),
})
export type RepositoryBoardFile = typeof repositoryBoardFileSchema.Type
