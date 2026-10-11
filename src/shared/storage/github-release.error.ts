import { Schema } from 'effect'

/** A GitHub Releases API call that failed; `retryable` for 5xx, 408 and network errors, `rateLimitWaitMs` for rate limits. */
export class GitHubReleaseError extends Schema.TaggedError<GitHubReleaseError>()(
	'GitHubReleaseError',
	{
		message: Schema.String,
		status: Schema.optional(Schema.Number),
		retryable: Schema.Boolean,
		/** How long GitHub asked to wait when it rejected the request for a rate limit. */
		rateLimitWaitMs: Schema.optional(Schema.Number),
	}
) {}
