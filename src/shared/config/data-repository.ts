import { Config, Schema } from 'effect'

const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/u

/** Repository whose releases hold the data files when `DATA_REPOSITORY` is not set. */
export const DEFAULT_DATA_REPOSITORY = 'Mnigos/merged'

/**
 * GitHub repository whose releases hold the data files, read from
 * `DATA_REPOSITORY` as `owner/name`; `DEFAULT_DATA_REPOSITORY` (this
 * repository) when unset.
 */
export const dataRepositoryConfig = Config.schema(
	Schema.String.pipe(Schema.check(Schema.isPattern(REPOSITORY_PATTERN))),
	'DATA_REPOSITORY'
).pipe(Config.withDefault(DEFAULT_DATA_REPOSITORY))
