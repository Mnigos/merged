import { githubLoginSchema } from '@shared/schema/github-login'
import { Option, Schema } from 'effect'

const accountSchema = Schema.Struct({ login: githubLoginSchema })

const repositorySchema = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
})

/**
 * A `PullRequestEvent` line. GH Archive trimmed pull request payloads in 2025:
 * current lines carry `action: "merged"` with the author as `actor`, older lines
 * carry `action: "closed"` with `merged`, `user` and `merged_by`.
 */
export const pullRequestEventSchema = Schema.Struct({
	type: Schema.Literal('PullRequestEvent'),
	actor: accountSchema,
	repo: repositorySchema,
	created_at: Schema.String,
	payload: Schema.Struct({
		action: Schema.String,
		number: Schema.Number,
		pull_request: Schema.optional(
			Schema.Struct({
				merged: Schema.optional(Schema.NullOr(Schema.Boolean)),
				merged_at: Schema.optional(Schema.NullOr(Schema.String)),
				merged_by: Schema.optional(Schema.NullOr(accountSchema)),
				user: Schema.optional(Schema.NullOr(accountSchema)),
			})
		),
	}),
})
export type PullRequestEvent = typeof pullRequestEventSchema.Type

export const watchEventSchema = Schema.Struct({
	type: Schema.Literal('WatchEvent'),
	actor: accountSchema,
	repo: repositorySchema,
	created_at: Schema.String,
})
export type WatchEvent = typeof watchEventSchema.Type

/** The GH Archive event types ingest reads; every other type is skipped. */
export const archiveEventSchema = Schema.Union([
	pullRequestEventSchema,
	watchEventSchema,
])
export type ArchiveEvent = typeof archiveEventSchema.Type

/** Raw-line markers of the event types in `archiveEventSchema`. */
export const ARCHIVE_EVENT_MARKERS = [
	'"type":"PullRequestEvent"',
	'"type":"WatchEvent"',
] as const satisfies readonly string[]

/** Cheap substring check that lets a raw line through to JSON decoding. */
export const hasArchiveEventMarker = (line: string) =>
	ARCHIVE_EVENT_MARKERS.some(marker => line.includes(marker))

const decodeArchiveEventJson = Schema.decodeUnknownOption(
	Schema.fromJsonString(archiveEventSchema)
)

/** Decodes one raw GH Archive line; `undefined` for malformed or unrelated lines. */
export const decodeArchiveLine = (line: string) =>
	Option.getOrUndefined(decodeArchiveEventJson(line))
