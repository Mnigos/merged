import { Schema } from 'effect'

export class ProfileSourceError extends Schema.TaggedError<ProfileSourceError>()(
	'ProfileSourceError',
	{
		message: Schema.String,
	}
) {}
