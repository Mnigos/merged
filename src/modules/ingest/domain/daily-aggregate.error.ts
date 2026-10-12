import { Schema } from 'effect'

export class DailyAggregateMergeError extends Schema.TaggedError<DailyAggregateMergeError>()(
	'DailyAggregateMergeError',
	{
		dates: Schema.Array(Schema.String),
		message: Schema.String,
	}
) {}
