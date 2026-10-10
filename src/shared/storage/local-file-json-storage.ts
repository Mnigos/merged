import { Effect, FileSystem, Layer, Option, Path, Random } from 'effect'
import { JsonStorage } from './json-storage.port'
import { toStorageSegments } from './storage-path'
import { StorageError } from './storage.error'

const toError = (path: string) => (cause: { readonly message: string }) =>
	new StorageError({ path, message: `${path}: ${cause.message}` })

/**
 * `JsonStorage` on the local disk under `rootDirectory`. Writes go to a staged
 * temporary file that is renamed into place, so an interrupted write never
 * replaces a valid file; parent directories are created on demand.
 */
export const localFileJsonStorageLayer = (rootDirectory: string) =>
	Layer.effect(
		JsonStorage,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const pathService = yield* Path.Path
			const toLocation = (path: string) =>
				Effect.fromResult(toStorageSegments(path)).pipe(
					Effect.map(segments => pathService.join(rootDirectory, ...segments))
				)

			const readText = Effect.fn('LocalFileJsonStorage.readText')(function* (
				path: string
			) {
				const location = yield* toLocation(path)
				const exists = yield* fs
					.exists(location)
					.pipe(Effect.mapError(toError(path)))
				if (!exists) return Option.none<string>()

				return Option.some(
					yield* fs
						.readFileString(location)
						.pipe(Effect.mapError(toError(path)))
				)
			})

			const writeText = Effect.fn('LocalFileJsonStorage.writeText')(function* (
				path: string,
				text: string
			) {
				const location = yield* toLocation(path)
				const staging = `${location}.tmp-${yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)}`
				yield* fs
					.makeDirectory(pathService.dirname(location), { recursive: true })
					.pipe(
						Effect.andThen(fs.writeFileString(staging, text)),
						Effect.andThen(fs.rename(staging, location)),
						Effect.onError(() =>
							fs.remove(staging, { force: true }).pipe(Effect.ignore)
						),
						Effect.mapError(toError(path))
					)

				return { location, bytes: Buffer.byteLength(text) }
			})

			return { readText, writeText }
		})
	)
