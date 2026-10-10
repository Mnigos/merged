import { Config, Option } from 'effect'

/** Where the website reads season files from: local disk or Vercel Blob. */
export type DataSource = 'local' | 'blob'

/**
 * The website's data source, read from `DATA_SOURCE` (`local` or `blob`).
 * Without it the source is `blob` when `BLOB_BASE_URL` is set and `local`
 * otherwise.
 */
export const dataSourceConfig = Config.all({
	source: Config.option(Config.Literals(['local', 'blob'], 'DATA_SOURCE')),
	blobBaseUrl: Config.option(Config.String('BLOB_BASE_URL')),
}).pipe(
	Config.map(({ source, blobBaseUrl }): DataSource =>
		Option.getOrElse(source, () =>
			Option.isSome(blobBaseUrl) ? 'blob' : 'local'
		)
	)
)

/** Directory of season files for the `local` data source, read from `DATA_DIR`, `data` by default. */
export const dataDirectoryConfig = Config.String('DATA_DIR').pipe(
	Config.withDefault('data')
)
