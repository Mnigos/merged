import { Config } from 'effect'

/** Vercel Blob read-write token for pipeline writes, read from `BLOB_READ_WRITE_TOKEN` and kept redacted. */
export const blobReadWriteTokenConfig = Config.Redacted('BLOB_READ_WRITE_TOKEN')

/**
 * Public URL of the Vercel Blob store, read from `BLOB_BASE_URL`, such as
 * `https://xxxx.public.blob.vercel-storage.com`; a trailing slash is dropped.
 */
export const blobBaseUrlConfig = Config.URL('BLOB_BASE_URL').pipe(
	Config.map(url => url.href.replace(/\/+$/u, ''))
)
