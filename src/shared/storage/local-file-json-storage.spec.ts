import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { Effect, FileSystem, Layer, Option, PlatformError } from 'effect'
import { JsonStorage } from './json-storage.port'
import { localFileJsonStorageLayer } from './local-file-json-storage'

const platformLayer = Layer.mergeAll(BunFileSystem.layer, BunPath.layer)
const path = 'days/2026-10-03.json'

const withStorage = <TValue, TError>(
	use: (
		directory: string
	) => Effect.Effect<TValue, TError, JsonStorage | FileSystem.FileSystem>
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		const directory = yield* fs.makeTempDirectoryScoped()

		return yield* use(directory).pipe(
			Effect.provide(localFileJsonStorageLayer(directory))
		)
	}).pipe(Effect.provide(platformLayer))

const simulatedFailure = (method: string, failedPath: string) =>
	PlatformError.systemError({
		_tag: 'Unknown',
		module: 'FileSystem',
		method,
		pathOrDescriptor: failedPath,
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

const withFailingStorage = <TValue, TError>(
	override: FileSystemOverride,
	use: (
		directory: string
	) => Effect.Effect<TValue, TError, JsonStorage | FileSystem.FileSystem>
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		const directory = yield* fs.makeTempDirectoryScoped()
		yield* Effect.gen(function* () {
			const storage = yield* JsonStorage
			yield* storage.writeText(path, '{"version":1}')
		}).pipe(Effect.provide(localFileJsonStorageLayer(directory)))

		return yield* use(directory).pipe(
			Effect.provide(
				localFileJsonStorageLayer(directory).pipe(
					Layer.provide(
						Layer.mergeAll(failingFileSystemLayer(override), BunPath.layer)
					)
				)
			),
			Effect.provideService(FileSystem.FileSystem, fs)
		)
	}).pipe(Effect.provide(platformLayer))

describe('localFileJsonStorageLayer', () => {
	it.live('writes a file under nested directories and reads it back', () =>
		withStorage(directory =>
			Effect.gen(function* () {
				const storage = yield* JsonStorage
				const fs = yield* FileSystem.FileSystem
				const stored = yield* storage.writeText(
					'seasons/2026-10/shards/0a.json',
					'{"ok":"żółw"}'
				)

				expect(stored).toEqual({
					location: `${directory}/seasons/2026-10/shards/0a.json`,
					bytes: Buffer.byteLength('{"ok":"żółw"}'),
				})
				expect(yield* fs.readFileString(stored.location)).toBe('{"ok":"żółw"}')
				expect(
					yield* storage.readText('seasons/2026-10/shards/0a.json')
				).toEqual(Option.some('{"ok":"żółw"}'))
			})
		)
	)

	it.live('reads a file that was never written as none', () =>
		withStorage(() =>
			Effect.gen(function* () {
				const storage = yield* JsonStorage

				expect(Option.isNone(yield* storage.readText(path))).toBe(true)
			})
		)
	)

	it.live('overwrites a file through a renamed temporary file', () => {
		const renames: string[][] = []

		return withFailingStorage(
			real => ({
				rename: (source, target) =>
					Effect.gen(function* () {
						expect(source).toMatch(/\.tmp-\d+$/u)
						expect(source.startsWith(`${target}.tmp-`)).toBe(true)
						expect(yield* real.readFileString(target)).toBe('{"version":1}')
						expect(yield* real.readFileString(source)).toBe('{"version":2}')
						renames.push([source, target])
						yield* real.rename(source, target)
					}),
			}),
			directory =>
				Effect.gen(function* () {
					const storage = yield* JsonStorage
					const fs = yield* FileSystem.FileSystem
					yield* storage.writeText(path, '{"version":2}')

					expect(renames).toHaveLength(1)
					expect(renames[0]?.[1]).toBe(`${directory}/${path}`)
					expect(yield* storage.readText(path)).toEqual(
						Option.some('{"version":2}')
					)
					expect(yield* fs.readDirectory(`${directory}/days`)).toEqual([
						'2026-10-03.json',
					])
				})
		)
	})

	it.live('keeps the previous file when writing the temporary file fails', () =>
		withFailingStorage(
			real => ({
				writeFileString: (target, data) =>
					real
						.writeFileString(target, data.slice(0, 3))
						.pipe(
							Effect.andThen(
								Effect.fail(simulatedFailure('writeFileString', target))
							)
						),
			}),
			directory =>
				Effect.gen(function* () {
					const storage = yield* JsonStorage
					const fs = yield* FileSystem.FileSystem

					expect(
						yield* Effect.flip(storage.writeText(path, '{"version":2}'))
					).toMatchObject({ _tag: 'StorageError', path })
					expect(yield* fs.readFileString(`${directory}/${path}`)).toBe(
						'{"version":1}'
					)
					expect(yield* fs.readDirectory(`${directory}/days`)).toEqual([
						'2026-10-03.json',
					])
				})
		)
	)

	it.live(
		'keeps the previous file and removes the temporary file when the rename fails',
		() =>
			withFailingStorage(
				() => ({
					rename: oldPath => Effect.fail(simulatedFailure('rename', oldPath)),
				}),
				directory =>
					Effect.gen(function* () {
						const storage = yield* JsonStorage
						const fs = yield* FileSystem.FileSystem

						expect(
							yield* Effect.flip(storage.writeText(path, '{"version":2}'))
						).toMatchObject({ _tag: 'StorageError', path })
						expect(yield* fs.readFileString(`${directory}/${path}`)).toBe(
							'{"version":1}'
						)
						expect(yield* fs.readDirectory(`${directory}/days`)).toEqual([
							'2026-10-03.json',
						])
					})
			)
	)

	it.live('fails with StorageError when reading fails', () =>
		withFailingStorage(
			() => ({
				readFileString: target =>
					Effect.fail(simulatedFailure('readFileString', target)),
			}),
			() =>
				Effect.gen(function* () {
					const storage = yield* JsonStorage

					expect(yield* Effect.flip(storage.readText(path))).toMatchObject({
						_tag: 'StorageError',
						path,
					})
				})
		)
	)

	it.live.each([
		'/etc/passwd',
		'../outside.json',
		'days/../outside.json',
		'days//x.json',
		'a/./b',
	])('rejects the path %j', invalidPath =>
		withStorage(() =>
			Effect.gen(function* () {
				const storage = yield* JsonStorage

				expect(
					yield* Effect.flip(storage.writeText(invalidPath, '{}'))
				).toMatchObject({ _tag: 'StorageError', path: invalidPath })
				expect(yield* Effect.flip(storage.readText(invalidPath))).toMatchObject(
					{ _tag: 'StorageError', path: invalidPath }
				)
			})
		)
	)
})
