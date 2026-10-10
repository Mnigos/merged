import { describe, expect, it } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { inMemoryJsonStorageLayer } from './in-memory-json-storage'
import { JsonStorage } from './json-storage.port'

describe('inMemoryJsonStorageLayer', () => {
	it.effect('serves seeded files and exposes written ones', () => {
		const files = new Map([['days/2026-10-01.json', '{}']])

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(yield* storage.readText('days/2026-10-01.json')).toEqual(
				Option.some('{}')
			)
			expect(yield* storage.readText('days/2026-10-02.json')).toEqual(
				Option.none()
			)
			expect(yield* storage.writeText('seasons/index.json', '[1]')).toEqual({
				location: 'memory://seasons/index.json',
				bytes: 3,
			})
			expect(files.get('seasons/index.json')).toBe('[1]')
			expect(yield* storage.readText('seasons/index.json')).toEqual(
				Option.some('[1]')
			)
			yield* storage.writeText('seasons/index.json', '{"name":"Łódź"}')
			expect(yield* storage.readText('seasons/index.json')).toEqual(
				Option.some('{"name":"Łódź"}')
			)
		}).pipe(Effect.provide(inMemoryJsonStorageLayer(files)))
	})

	it.effect('rejects a path that escapes the root', () =>
		Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(
				yield* Effect.flip(storage.writeText('../x.json', '{}'))
			).toMatchObject({ _tag: 'StorageError' })
		}).pipe(Effect.provide(inMemoryJsonStorageLayer()))
	)
})
