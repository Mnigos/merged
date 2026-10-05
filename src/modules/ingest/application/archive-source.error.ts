import { Schema } from 'effect'

export class ArchiveSourceError extends Schema.TaggedError<ArchiveSourceError>()(
	'ArchiveSourceError',
	{
		date: Schema.String,
		hour: Schema.Number,
		message: Schema.String,
	}
) {}
