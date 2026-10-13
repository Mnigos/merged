import { Config, Schema } from 'effect'

/** Where ingest reads merged pull requests from: GH Archive hour files or the GitHub search API. */
export const INGEST_SOURCES = [
	'archive',
	'search',
] as const satisfies readonly string[]

export const ingestSourceKindSchema = Schema.Literals(INGEST_SOURCES)
export type IngestSourceKind = typeof ingestSourceKindSchema.Type

/** The ingest source, read from `INGEST_SOURCE` (`archive` or `search`), `archive` by default. */
export const ingestSourceConfig = Config.Literals(
	INGEST_SOURCES,
	'INGEST_SOURCE'
).pipe(Config.withDefault<IngestSourceKind>('archive'))
