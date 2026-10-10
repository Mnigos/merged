import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import {
	cachedJsonStorageLayer,
	type CachedJsonStorageOptions,
} from './cached-json-storage'
import { JsonStorage } from './json-storage.port'
import { StorageError } from './storage.error'

const path = 'seasons/index.json'

const countingStorageWith = (
	files: Map<string, string>,
	options?: CachedJsonStorageOptions
) => {
	const reads: string[] = []
	const inner = Layer.succeed(JsonStorage, {
		readText: (readPath: string) =>
			readPath === 'fail.json'
				? Effect.sync(() => reads.push(readPath)).pipe(
						Effect.andThen(
							Effect.fail(new StorageError({ path: readPath, message: 'down' }))
						)
					)
				: Effect.sync(() => {
						reads.push(readPath)

						return Option.fromNullishOr(files.get(readPath))
					}),
		writeText: (writePath: string, text: string) =>
			Effect.sync(() => {
				files.set(writePath, text)

				return { location: `memory://${writePath}`, bytes: text.length }
			}),
	})

	return {
		reads,
		layer: cachedJsonStorageLayer(options).pipe(Layer.provide(inner)),
	}
}

describe('cachedJsonStorageLayer', () => {
	it.effect('serves a repeated read from memory within the TTL', () => {
		const files = new Map([[path, '{"generation":1}']])
		const { reads, layer } = countingStorageWith(files)

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.readText(path)).toEqual(
				Option.some('{"generation":1}')
			)
			files.set(path, '{"generation":2}')
			yield* TestClock.adjust('59 seconds')
			expect(yield* storage.readText(path)).toEqual(
				Option.some('{"generation":1}')
			)
			expect(reads).toEqual([path])
		}).pipe(Effect.provide(layer))
	})

	it.effect('reads the inner storage again once the TTL is over', () => {
		const files = new Map([[path, '{"generation":1}']])
		const { reads, layer } = countingStorageWith(files)

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			yield* storage.readText(path)
			files.set(path, '{"generation":2}')
			yield* TestClock.adjust('60 seconds')
			expect(yield* storage.readText(path)).toEqual(
				Option.some('{"generation":2}')
			)
			expect(reads).toEqual([path, path])
		}).pipe(Effect.provide(layer))
	})

	it.effect('caches a missing file like a present one', () => {
		const { reads, layer } = countingStorageWith(new Map())

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.readText(path)).toEqual(Option.none())
			expect(yield* storage.readText(path)).toEqual(Option.none())
			expect(reads).toEqual([path])
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'hides an externally created shard only until the original miss expires',
		() => {
			const shardPath = 'seasons/2026-10/shards/80.json'
			const files = new Map<string, string>()
			const { reads, layer } = countingStorageWith(files)

			return Effect.gen(function* () {
				const storage = yield* JsonStorage
				expect(yield* storage.readText(shardPath)).toEqual(Option.none())
				files.set(shardPath, '{"entries":{}}')
				yield* TestClock.adjust('59 seconds')
				expect(yield* storage.readText(shardPath)).toEqual(Option.none())
				expect(reads).toEqual([shardPath])
				yield* TestClock.adjust('1 second')
				expect(yield* storage.readText(shardPath)).toEqual(
					Option.some('{"entries":{}}')
				)
				expect(reads).toEqual([shardPath, shardPath])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect.each([undefined, 'old'])(
		'replaces cached %j on write and refreshes only that path',
		initial => {
			const otherPath = 'other.json'
			const files = new Map([[otherPath, 'other']])
			if (initial !== undefined) files.set(path, initial)
			const { reads, layer } = countingStorageWith(files)

			return Effect.gen(function* () {
				const storage = yield* JsonStorage
				expect(yield* storage.readText(path)).toEqual(
					Option.fromNullishOr(initial)
				)
				yield* storage.readText(otherPath)
				yield* TestClock.adjust('59 seconds')
				yield* storage.writeText(path, 'written')
				expect(files.get(path)).toBe('written')
				files.set(path, 'external')
				files.set(otherPath, 'other external')
				yield* TestClock.adjust('1 second')
				expect(yield* storage.readText(path)).toEqual(Option.some('written'))
				expect(yield* storage.readText(otherPath)).toEqual(
					Option.some('other external')
				)
				expect(reads).toEqual([path, otherPath, otherPath])
				yield* TestClock.adjust('59 seconds')
				expect(yield* storage.readText(path)).toEqual(Option.some('external'))
				expect(reads).toEqual([path, otherPath, otherPath, path])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('does not cache a failed read', () => {
		const { reads, layer } = countingStorageWith(new Map())

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* Effect.flip(storage.readText('fail.json'))).toMatchObject({
				_tag: 'StorageError',
				path: 'fail.json',
			})
			yield* Effect.flip(storage.readText('fail.json'))
			expect(reads).toEqual(['fail.json', 'fail.json'])
		}).pipe(Effect.provide(layer))
	})

	it.effect('serves its own write without reading', () => {
		const { reads, layer } = countingStorageWith(new Map())

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			yield* storage.writeText(path, '{"generation":3}')
			expect(yield* storage.readText(path)).toEqual(
				Option.some('{"generation":3}')
			)
			expect(reads).toEqual([])
		}).pipe(Effect.provide(layer))
	})

	it.effect('evicts the least recently used path beyond the cap', () => {
		const files = new Map([
			['a.json', 'a'],
			['b.json', 'b'],
			['c.json', 'c'],
		])
		const { reads, layer } = countingStorageWith(files, { maxEntries: 2 })

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			yield* storage.readText('a.json')
			yield* storage.readText('b.json')
			yield* storage.readText('a.json')
			yield* storage.readText('c.json')
			yield* storage.readText('a.json')
			yield* storage.readText('b.json')
			expect(reads).toEqual(['a.json', 'b.json', 'c.json', 'b.json'])
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'prunes expired entries so they do not count towards the cap',
		() => {
			const files = new Map([
				['a.json', 'a'],
				['b.json', 'b'],
				['c.json', 'c'],
			])
			const { reads, layer } = countingStorageWith(files, { maxEntries: 2 })

			return Effect.gen(function* () {
				const storage = yield* JsonStorage

				yield* storage.readText('a.json')
				yield* TestClock.adjust('60 seconds')
				yield* storage.readText('b.json')
				yield* storage.readText('c.json')
				yield* storage.readText('b.json')
				yield* storage.readText('c.json')
				expect(reads).toEqual(['a.json', 'b.json', 'c.json'])
			}).pipe(Effect.provide(layer))
		}
	)
})
