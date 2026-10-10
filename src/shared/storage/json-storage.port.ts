import { Context, type Effect, type Option } from 'effect'
import type { StorageError } from './storage.error'

/** Where a file was written and its size in bytes. */
export interface StoredFile {
	readonly location: string
	readonly bytes: number
}

/**
 * Provider-agnostic text storage addressed by POSIX-relative paths such as
 * `days/2026-10-01.json`. Modules build typed stores on top of it.
 */
export interface JsonStorageShape {
	readonly readText: (
		path: string
	) => Effect.Effect<Option.Option<string>, StorageError>
	readonly writeText: (
		path: string,
		text: string
	) => Effect.Effect<StoredFile, StorageError>
}

export class JsonStorage extends Context.Service<
	JsonStorage,
	JsonStorageShape
>()('shared/JsonStorage') {}
