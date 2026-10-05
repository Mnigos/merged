import { Schema } from 'effect'

export class DayStoreError extends Schema.TaggedError<DayStoreError>()(
	'DayStoreError',
	{
		date: Schema.String,
		message: Schema.String,
	}
) {}
