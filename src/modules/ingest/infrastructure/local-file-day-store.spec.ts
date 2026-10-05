import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import {
	Effect,
	FileSystem,
	Layer,
	Option,
	PlatformError,
	Schema,
} from 'effect'
import { DayStore } from '../application/day-store.port'
import {
	dailyAggregateSchema,
	type DailyAggregate,
} from '../domain/daily-aggregate'
import { localFileDayStoreLayer } from './local-file-day-store'

const date = isoDateSchema.make('2026-10-03')
const platformLayer = Layer.mergeAll(BunFileSystem.layer, BunPath.layer)

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

const withStore = <TValue, TError>(
	use: (
		directory: string
	) => Effect.Effect<TValue, TError, DayStore | FileSystem.FileSystem>
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		const directory = yield* fs.makeTempDirectoryScoped()

		return yield* use(directory).pipe(
			Effect.provide(localFileDayStoreLayer(directory))
		)
	}).pipe(Effect.provide(platformLayer))

const updatedAggregate = {
	...aggregate,
	totals: { ...aggregate.totals, stars: 5 },
	repositories: [{ repository: 'acme/widgets', stars: 5, mergeAuthors: 1 }],
} as const satisfies DailyAggregate

const simulatedFailure = (method: string, path: string) =>
	PlatformError.systemError({
		_tag: 'Unknown',
		module: 'FileSystem',
		method,
		pathOrDescriptor: path,
		description: 'simulated failure',
	})

type FileSystemOverride = (
	real: FileSystem.FileSystem
) => Partial<FileSystem.FileSystem>

const failingFileSystemLayer = (override: FileSystemOverride) =>
	Layer.effect(
		FileSystem.FileSystem,
		Effect.gen(function* () {
			const real = yield* FileSystem.FileSystem

			return { ...real, ...override(real) }
		})
	).pipe(Layer.provide(BunFileSystem.layer))

const withFailingStore = <TValue, TError>(
	override: FileSystemOverride,
	use: (
		directory: string
	) => Effect.Effect<TValue, TError, DayStore | FileSystem.FileSystem>
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		const directory = yield* fs.makeTempDirectoryScoped()
		yield* Effect.gen(function* () {
			const store = yield* DayStore
			yield* store.write(aggregate)
		}).pipe(Effect.provide(localFileDayStoreLayer(directory)))

		return yield* use(directory).pipe(
			Effect.provide(
				localFileDayStoreLayer(directory).pipe(
					Layer.provide(
						Layer.mergeAll(failingFileSystemLayer(override), BunPath.layer)
					)
				)
			),
			Effect.provideService(FileSystem.FileSystem, fs)
		)
	}).pipe(Effect.provide(platformLayer))

describe('localFileDayStoreLayer', () => {
	it.live('overwrites a day through a renamed temporary file', () =>
		withStore(directory =>
			Effect.gen(function* () {
				const store = yield* DayStore
				const fs = yield* FileSystem.FileSystem
				yield* store.write(aggregate)
				yield* store.write(updatedAggregate)

				expect(Option.getOrThrow(yield* store.read(date))).toEqual(
					updatedAggregate
				)
				expect(yield* fs.readDirectory(`${directory}/days`)).toEqual([
					'2026-10-03.json',
				])
			})
		)
	)

	it.live('keeps the previous day when writing the temporary file fails', () =>
		withFailingStore(
			real => ({
				writeFileString: (path, data) =>
					real
						.writeFileString(path, data.slice(0, 10))
						.pipe(
							Effect.andThen(
								Effect.fail(simulatedFailure('writeFileString', path))
							)
						),
			}),
			directory =>
				Effect.gen(function* () {
					const store = yield* DayStore
					const fs = yield* FileSystem.FileSystem

					expect(
						yield* Effect.flip(store.write(updatedAggregate))
					).toMatchObject({
						_tag: 'DayStoreError',
						date: '2026-10-03',
					})
					expect(
						yield* Schema.decodeUnknownEffect(
							Schema.fromJsonString(dailyAggregateSchema)
						)(yield* fs.readFileString(`${directory}/days/2026-10-03.json`))
					).toEqual(aggregate)
					expect(yield* fs.readDirectory(`${directory}/days`)).toEqual([
						'2026-10-03.json',
					])
				})
		)
	)

	it.live(
		'keeps the previous day and removes the temporary file when the rename fails',
		() =>
			withFailingStore(
				() => ({
					rename: oldPath => Effect.fail(simulatedFailure('rename', oldPath)),
				}),
				directory =>
					Effect.gen(function* () {
						const store = yield* DayStore
						const fs = yield* FileSystem.FileSystem

						expect(
							yield* Effect.flip(store.write(updatedAggregate))
						).toMatchObject({
							_tag: 'DayStoreError',
						})
						expect(
							yield* fs.readFileString(`${directory}/days/2026-10-03.json`)
						).toContain('"stars":2')
						expect(yield* fs.readDirectory(`${directory}/days`)).toEqual([
							'2026-10-03.json',
						])
					})
			)
	)

	it.live(
		'writes identical bytes twice and round-trips the persisted JSON Schema',
		() =>
			withStore(() =>
				Effect.gen(function* () {
					const store = yield* DayStore
					const fs = yield* FileSystem.FileSystem
					const first = yield* store.write(aggregate)
					const firstBytes = yield* fs.readFile(first.location)
					const second = yield* store.write(aggregate)
					const secondBytes = yield* fs.readFile(second.location)

					expect(second).toEqual(first)
					expect(first.bytes).toBe(firstBytes.byteLength)
					expect(secondBytes).toEqual(firstBytes)
					expect(
						yield* Schema.decodeUnknownEffect(
							Schema.fromJsonString(dailyAggregateSchema)
						)(new TextDecoder().decode(secondBytes))
					).toEqual(aggregate)
				})
			)
	)

	it.live('writes days/<date>.json and reads it back', () =>
		withStore(directory =>
			Effect.gen(function* () {
				const store = yield* DayStore
				const fs = yield* FileSystem.FileSystem
				const stored = yield* store.write(aggregate)

				expect(stored.location).toBe(`${directory}/days/2026-10-03.json`)
				expect(stored.bytes).toBe(
					(yield* fs.readFileString(stored.location)).length
				)
				expect(Option.getOrThrow(yield* store.read(date))).toEqual(aggregate)
			})
		)
	)

	it.live('reads a day that was never written as none', () =>
		withStore(() =>
			Effect.gen(function* () {
				const store = yield* DayStore

				expect(Option.isNone(yield* store.read(date))).toBe(true)
			})
		)
	)

	it.live('fails with DayStoreError on a corrupt file', () =>
		withStore(directory =>
			Effect.gen(function* () {
				const store = yield* DayStore
				const fs = yield* FileSystem.FileSystem
				yield* fs.makeDirectory(`${directory}/days`, { recursive: true })
				yield* fs.writeFileString(`${directory}/days/2026-10-03.json`, '{')

				expect(yield* Effect.flip(store.read(date))).toMatchObject({
					_tag: 'DayStoreError',
					date: '2026-10-03',
				})
			})
		)
	)
})
