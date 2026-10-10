import { Schema } from 'effect'

export class GitHubGraphqlError extends Schema.TaggedError<GitHubGraphqlError>()(
	'GitHubGraphqlError',
	{
		message: Schema.String,
		status: Schema.optional(Schema.Number),
		retryable: Schema.Boolean,
	}
) {}
