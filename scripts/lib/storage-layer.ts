import type { ParseArgsOptionDescriptor } from 'node:util'
import type { JsonStorage } from '@shared/storage/json-storage.port'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { vercelBlobJsonStorageLayer } from '@shared/storage/vercel-blob-json-storage'
import { type Config, type FileSystem, Layer, type Path, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'

/** Where a pipeline script keeps its files: local disk or Vercel Blob. */
export const storageKindSchema = Schema.Literals(['local', 'blob'])
export type StorageKind = typeof storageKindSchema.Type

/** `parseArgs` option of the `--storage local|blob` flag every script shares. */
export const STORAGE_OPTION = {
	type: 'string',
	default: 'local',
} as const satisfies ParseArgsOptionDescriptor

export interface StorageLayerOptions {
	readonly storage: StorageKind
	readonly dataDirectory: string
}

/**
 * `JsonStorage` for a script: files under `dataDirectory` for `local`, the
 * Vercel Blob store from `BLOB_READ_WRITE_TOKEN` and `BLOB_BASE_URL` over
 * fetch for `blob`. Paths are the same in both.
 */
export function toStorageLayer({
	storage,
	dataDirectory,
}: StorageLayerOptions): Layer.Layer<
	JsonStorage,
	Config.ConfigError,
	FileSystem.FileSystem | Path.Path
> {
	if (storage === 'blob')
		return vercelBlobJsonStorageLayer.pipe(Layer.provide(FetchHttpClient.layer))

	return localFileJsonStorageLayer(dataDirectory)
}
