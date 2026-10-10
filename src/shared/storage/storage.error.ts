import { Schema } from 'effect'

export class StorageError extends Schema.TaggedError<StorageError>()(
	'StorageError',
	{
		path: Schema.String,
		message: Schema.String,
	}
) {}
