import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { StorageError } from '@shared/storage/storage.error'
import { Effect, FileSystem, Layer, Option, Schema } from 'effect'
import { DayStore } from '../application/day-store.port'
import {
	dailyAggregateSchema,
	type DailyAggregate,
} from '../domain/daily-aggregate'
import { jsonDayStoreLayer, toDayPath } from './json-day-store'

const date = isoDateSchema.make('2026-10-03')

const aggregate = {
	date,
	totals: { merged: 1, selfMerged: 0, ownRepo: 1, stars: 2 },
	contributions: [
		{
			author: githubLoginSchema.make('alice'),
			repository: 'acme/widgets',
			merged: 1,
			selfMerged: 0,
			mergedPullRequests: [7],
		},
	],
	ownRepoMerges: { alice: 1 },
	repositories: [{ repository: 'acme/widgets', stars: 2, mergeAuthors: 1 }],
} as const satisfies DailyAggregate

const updatedAggregate = {
	...aggregate,
	totals: { ...aggregate.totals, stars: 5 },
	repositories: [{ repository: 'acme/widgets', stars: 5, mergeAuthors: 1 }],
} as const satisfies DailyAggregate

const decodeJson = Schema.decodeUnknownSync(
	Schema.fromJsonString(dailyAggregateSchema)
)

const storeOver = (files: Map<string, string>) =>
	jsonDayStoreLayer.pipe(Layer.provide(inMemoryJsonStorageLayer(files)))

const failingStorageLayer = Layer.succeed(JsonStorage, {
	readText: path =>
		Effect.fail(new StorageError({ path, message: 'storage offline' })),
	writeText: path =>
		Effect.fail(new StorageError({ path, message: 'storage offline' })),
})

describe('jsonDayStoreLayer', () => {
	it('stores a day at days/<date>.json', () => {
		expect(toDayPath(date)).toBe('days/2026-10-03.json')
	})

	it.effect('writes the day as JSON and reads it back', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			const store = yield* DayStore
			const stored = yield* store.write(aggregate)
			const text = files.get('days/2026-10-03.json') ?? ''

			expect(stored).toEqual({
				location: 'memory://days/2026-10-03.json',
				bytes: Buffer.byteLength(text),
			})
			expect(decodeJson(text)).toEqual(aggregate)
			expect(Option.getOrThrow(yield* store.read(date))).toEqual(aggregate)
		}).pipe(Effect.provide(storeOver(files)))
	})

	it.effect(
		'overwrites a day and writes identical bytes for the same day',
		() => {
			const files = new Map<string, string>()

			return Effect.gen(function* () {
				const store = yield* DayStore
				yield* store.write(aggregate)
				const first = files.get('days/2026-10-03.json')
				yield* store.write(aggregate)

				expect(files.get('days/2026-10-03.json')).toBe(first)

				yield* store.write(updatedAggregate)

				expect(Option.getOrThrow(yield* store.read(date))).toEqual(
					updatedAggregate
				)
				expect([...files.keys()]).toEqual(['days/2026-10-03.json'])
			}).pipe(Effect.provide(storeOver(files)))
		}
	)

	it.effect('reads a day that was never written as none', () =>
		Effect.gen(function* () {
			const store = yield* DayStore

			expect(Option.isNone(yield* store.read(date))).toBe(true)
		}).pipe(Effect.provide(storeOver(new Map())))
	)

	it.effect.each(['{', '{"date":"2026-10-03"}', '[]'])(
		'fails with DayStoreError on the invalid file %j',
		text =>
			Effect.gen(function* () {
				const store = yield* DayStore

				expect(yield* Effect.flip(store.read(date))).toMatchObject({
					_tag: 'DayStoreError',
					date: '2026-10-03',
				})
			}).pipe(
				Effect.provide(storeOver(new Map([['days/2026-10-03.json', text]])))
			)
	)

	it.effect('translates storage failures into DayStoreError', () =>
		Effect.gen(function* () {
			const store = yield* DayStore

			const writeError = yield* Effect.flip(store.write(aggregate))

			expect(writeError).toMatchObject({
				_tag: 'DayStoreError',
				date: '2026-10-03',
			})
			expect(writeError.message).toContain('storage offline')
			expect(yield* Effect.flip(store.read(date))).toMatchObject({
				_tag: 'DayStoreError',
				date: '2026-10-03',
			})
		}).pipe(
			Effect.provide(jsonDayStoreLayer.pipe(Layer.provide(failingStorageLayer)))
		)
	)

	it.live('round-trips a day through local files', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const directory = yield* fs.makeTempDirectoryScoped()

			yield* Effect.gen(function* () {
				const store = yield* DayStore
				const stored = yield* store.write(aggregate)

				expect(stored.location).toBe(`${directory}/days/2026-10-03.json`)
				expect(stored.bytes).toBe(
					(yield* fs.readFile(stored.location)).byteLength
				)
				expect(Option.getOrThrow(yield* store.read(date))).toEqual(aggregate)
			}).pipe(
				Effect.provide(
					jsonDayStoreLayer.pipe(
						Layer.provide(localFileJsonStorageLayer(directory))
					)
				)
			)
		}).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
	)
})
