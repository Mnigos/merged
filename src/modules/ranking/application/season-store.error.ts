import { Schema } from 'effect'

export class SeasonStoreError extends Schema.TaggedError<SeasonStoreError>()(
	'SeasonStoreError',
	{
		path: Schema.String,
		message: Schema.String,
	}
) {}
