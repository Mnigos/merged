import { Schema } from 'effect'

export class InvalidHoursError extends Schema.TaggedError<InvalidHoursError>()(
	'InvalidHoursError',
	{
		input: Schema.String,
		message: Schema.String,
	}
) {}
