import { Effect, Layer, Option } from 'effect'
import { JsonStorage } from './json-storage.port'

/**
 * Decorates the `JsonStorage` it is provided with: every write is delegated
 * and then remembered, and reads serve remembered texts before delegating.
 * One pipeline run therefore reads its own writes even when the inner
 * storage serves stale content, such as Vercel Blob behind its CDN. Texts
 * stay in memory for the life of the layer.
 */
export const writeThroughJsonStorageLayer = Layer.effect(
	JsonStorage,
	Effect.gen(function* () {
		const inner = yield* JsonStorage
		const written = new Map<string, string>()

		const readText = Effect.fn('WriteThroughJsonStorage.readText')(function* (
			path: string
		) {
			const text = written.get(path)
			if (text !== undefined) return Option.some(text)

			return yield* inner.readText(path)
		})

		const writeText = Effect.fn('WriteThroughJsonStorage.writeText')(function* (
			path: string,
			text: string
		) {
			const stored = yield* inner.writeText(path, text)
			written.set(path, text)

			return stored
		})

		return { readText, writeText }
	})
)
