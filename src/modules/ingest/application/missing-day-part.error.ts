import { Schema } from 'effect'

export class MissingDayPartError extends Schema.TaggedError<MissingDayPartError>()(
	'MissingDayPartError',
	{
		date: Schema.String,
		label: Schema.String,
		message: Schema.String,
	}
) {}
