import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'
import { JsonStorage } from './json-storage.port'
import { StorageError } from './storage.error'
import { writeThroughJsonStorageLayer } from './write-through-json-storage'

const path = 'seasons/2026-10/candidates.json'

const staleStorageWith = (files: ReadonlyMap<string, string>) => {
	const writes: string[] = []
	const reads: string[] = []
	const inner = Layer.succeed(JsonStorage, {
		readText: (readPath: string) =>
			Effect.sync(() => {
				reads.push(readPath)

				return Option.fromNullishOr(files.get(readPath))
			}),
		writeText: (writePath: string, text: string) =>
			writePath === 'fail.json'
				? Effect.fail(new StorageError({ path: writePath, message: 'down' }))
				: Effect.sync(() => {
						writes.push(writePath)

						return { location: `stale://${writePath}`, bytes: text.length }
					}),
	})

	return {
		writes,
		reads,
		layer: writeThroughJsonStorageLayer.pipe(Layer.provide(inner)),
	}
}

describe('writeThroughJsonStorageLayer', () => {
	it.effect('reads its own write while the inner storage is stale', () => {
		const { writes, reads, layer } = staleStorageWith(
			new Map([[path, '{"generation":1}']])
		)

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.writeText(path, '{"generation":2}')).toEqual({
				location: `stale://${path}`,
				bytes: 16,
			})
			expect(yield* storage.readText(path)).toEqual(
				Option.some('{"generation":2}')
			)
			expect(writes).toEqual([path])
			expect(reads).toEqual([])
		}).pipe(Effect.provide(layer))
	})

	it.effect('passes untouched paths through to the inner storage', () => {
		const { reads, layer } = staleStorageWith(
			new Map([['days/2026-10-03.json', '{}']])
		)

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.readText('days/2026-10-03.json')).toEqual(
				Option.some('{}')
			)
			expect(yield* storage.readText('days/2026-10-04.json')).toEqual(
				Option.none()
			)
			expect(reads).toEqual(['days/2026-10-03.json', 'days/2026-10-04.json'])
		}).pipe(Effect.provide(layer))
	})

	it.effect('does not remember a write that failed', () => {
		const { reads, layer } = staleStorageWith(new Map())

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(
				yield* Effect.flip(storage.writeText('fail.json', '{}'))
			).toMatchObject({ _tag: 'StorageError', path: 'fail.json' })
			expect(yield* storage.readText('fail.json')).toEqual(Option.none())
			expect(reads).toEqual(['fail.json'])
		}).pipe(Effect.provide(layer))
	})
})
