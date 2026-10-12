import { Schema } from 'effect'

export class SearchSourceError extends Schema.TaggedError<SearchSourceError>()(
	'SearchSourceError',
	{
		date: Schema.String,
		hour: Schema.Number,
		message: Schema.String,
	}
) {}
