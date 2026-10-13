import { Config, Option } from 'effect'

/** Where the website reads season files from: local disk, GitHub Releases or Vercel Blob. */
export type DataSource = 'local' | 'github' | 'blob'

/**
 * The website's data source, read from `DATA_SOURCE` (`local`, `github` or
 * `blob`). Without it the source is `github` when `DATA_REPOSITORY` is set,
 * else `blob` when `BLOB_BASE_URL` is set, else `local`.
 */
export const dataSourceConfig = Config.all({
	source: Config.option(
		Config.Literals(['local', 'github', 'blob'], 'DATA_SOURCE')
	),
	dataRepository: Config.option(Config.String('DATA_REPOSITORY')),
	blobBaseUrl: Config.option(Config.String('BLOB_BASE_URL')),
}).pipe(
	Config.map(({ source, dataRepository, blobBaseUrl }): DataSource => {
		if (Option.isSome(source)) return source.value
		if (Option.isSome(dataRepository)) return 'github'

		return Option.isSome(blobBaseUrl) ? 'blob' : 'local'
	})
)

/** Directory of season files for the `local` data source, read from `DATA_DIR`, `data` by default. */
export const dataDirectoryConfig = Config.String('DATA_DIR').pipe(
	Config.withDefault('data')
)
