import { Clock, Duration, Effect, Layer, Option } from 'effect'
import { JsonStorage } from './json-storage.port'

/** How long a read is served from memory before the inner storage is asked again. */
export const READ_CACHE_TTL = Duration.seconds(60)

/** Most paths kept at once: the recently read of a season's 1024 shards plus a handful of boards. */
export const READ_CACHE_MAX_ENTRIES = 256

interface CachedText {
	readonly text: Option.Option<string>
	readonly expiresAt: number
}

export interface CachedJsonStorageOptions {
	readonly ttl?: Duration.Input
	readonly maxEntries?: number
}

/**
 * Decorates the `JsonStorage` it is provided with a bounded read cache per
 * path: a text (or its absence) is served from memory for `ttl`, measured
 * with `Clock`, then read again. Expired entries are pruned on every access;
 * beyond `maxEntries` the least recently used path is evicted (a `Map` kept
 * in use order). Writes go through and replace the entry. Failed reads are
 * not cached. Meant for the website, where a page view should not refetch
 * Blob files that change once a day.
 */
export const cachedJsonStorageLayer = ({
	ttl = READ_CACHE_TTL,
	maxEntries = READ_CACHE_MAX_ENTRIES,
}: CachedJsonStorageOptions = {}) =>
	Layer.effect(
		JsonStorage,
		Effect.gen(function* () {
			const inner = yield* JsonStorage
			const ttlMillis = Duration.toMillis(ttl)
			const cache = new Map<string, CachedText>()

			function prune(now: number) {
				for (const [path, cached] of cache)
					if (cached.expiresAt <= now) cache.delete(path)
			}

			function remember(
				path: string,
				text: Option.Option<string>,
				now: number
			) {
				cache.delete(path)
				cache.set(path, { text, expiresAt: now + ttlMillis })
				for (const oldest of cache.keys()) {
					if (cache.size <= maxEntries) break
					cache.delete(oldest)
				}
			}

			const readText = Effect.fn('CachedJsonStorage.readText')(function* (
				path: string
			) {
				const now = yield* Clock.currentTimeMillis
				prune(now)
				const cached = cache.get(path)
				if (cached) {
					cache.delete(path)
					cache.set(path, cached)

					return cached.text
				}

				const text = yield* inner.readText(path)
				remember(path, text, now)

				return text
			})

			const writeText = Effect.fn('CachedJsonStorage.writeText')(function* (
				path: string,
				text: string
			) {
				const stored = yield* inner.writeText(path, text)
				const now = yield* Clock.currentTimeMillis
				prune(now)
				remember(path, Option.some(text), now)

				return stored
			})

			return { readText, writeText }
		})
	)
