import { Schema } from 'effect'

export class EnrichmentSourceError extends Schema.TaggedError<EnrichmentSourceError>()(
	'EnrichmentSourceError',
	{
		season: Schema.String,
		message: Schema.String,
	}
) {}
