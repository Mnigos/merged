import { Schema } from 'effect'

export class InvalidPartsError extends Schema.TaggedError<InvalidPartsError>()(
	'InvalidPartsError',
	{
		input: Schema.String,
		message: Schema.String,
	}
) {}
