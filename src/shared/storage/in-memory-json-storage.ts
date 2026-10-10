import { Effect, Layer, Option } from 'effect'
import { JsonStorage } from './json-storage.port'
import { toStorageSegments } from './storage-path'

/**
 * Test `JsonStorage` over a map from path to text. Pass a map to seed files
 * before the run and inspect them after; a fresh map is used otherwise.
 */
export const inMemoryJsonStorageLayer = (files?: Map<string, string>) =>
	Layer.sync(JsonStorage, () => {
		const store = files ?? new Map<string, string>()

		return {
			readText: (path: string) =>
				Effect.fromResult(toStorageSegments(path)).pipe(
					Effect.map(() => Option.fromNullishOr(store.get(path)))
				),
			writeText: (path: string, text: string) =>
				Effect.fromResult(toStorageSegments(path)).pipe(
					Effect.map(() => {
						store.set(path, text)

						return {
							location: `memory://${path}`,
							bytes: Buffer.byteLength(text),
						}
					})
				),
		}
	})
