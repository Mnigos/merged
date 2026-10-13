import { Clock, Duration, Effect, Layer, Option } from 'effect'
import { JsonStorage } from './json-storage.port'

/** How long a read is served from memory before the inner storage is asked again. */
export const READ_CACHE_TTL = Duration.seconds(60)

/** Most paths kept at once, a season's 128 shards plus boards and index. */
export const READ_CACHE_MAX_ENTRIES = 256

/** Most bytes of cached text kept at once, enough for every shard of a full-month season. */
export const READ_CACHE_MAX_BYTES = 64 * 1024 * 1024

interface CachedText {
	readonly text: Option.Option<string>
	readonly bytes: number
	readonly expiresAt: number
}

export interface CachedJsonStorageOptions {
	readonly ttl?: Duration.Input
	readonly maxEntries?: number
	readonly maxBytes?: number
}

/**
 * Decorates the `JsonStorage` it is provided with a bounded read cache per
 * path: a text (or its absence) is served from memory for `ttl`, measured
 * with `Clock`, then read again. Expired entries are pruned on every access;
 * beyond `maxEntries` paths or `maxBytes` of UTF-8 text the least recently
 * used paths are evicted (a `Map` kept in use order). A text larger than
 * `maxBytes` is served but neither kept nor allowed to evict other paths. Writes go through and replace the entry. Failed reads are
 * not cached. Meant for the website, where a page view should not refetch
 * data files that change once a day.
 */
export const cachedJsonStorageLayer = ({
	ttl = READ_CACHE_TTL,
	maxEntries = READ_CACHE_MAX_ENTRIES,
	maxBytes = READ_CACHE_MAX_BYTES,
}: CachedJsonStorageOptions = {}) =>
	Layer.effect(
		JsonStorage,
		Effect.gen(function* () {
			const inner = yield* JsonStorage
			const ttlMillis = Duration.toMillis(ttl)
			const cache = new Map<string, CachedText>()
			let cachedBytes = 0

			function forget(path: string) {
				cachedBytes -= cache.get(path)?.bytes ?? 0
				cache.delete(path)
			}

			function prune(now: number) {
				for (const [path, cached] of cache)
					if (cached.expiresAt <= now) forget(path)
			}

			function remember(
				path: string,
				text: Option.Option<string>,
				now: number
			) {
				forget(path)
				const bytes = Option.match(text, {
					onNone: () => 0,
					onSome: value => Buffer.byteLength(value),
				})
				if (bytes > maxBytes) return
				cache.set(path, { text, bytes, expiresAt: now + ttlMillis })
				cachedBytes += bytes
				for (const oldest of cache.keys()) {
					if (cache.size <= maxEntries && cachedBytes <= maxBytes) break
					forget(oldest)
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
