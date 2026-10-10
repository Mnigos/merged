import { Schema } from 'effect'

export class ProfileStoreError extends Schema.TaggedError<ProfileStoreError>()(
	'ProfileStoreError',
	{
		path: Schema.String,
		message: Schema.String,
	}
) {}
