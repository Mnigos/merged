import { parseArgs } from 'node:util'
import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { JsonStorage } from '@shared/storage/json-storage.port'
import {
	ConfigProvider,
	Effect,
	FileSystem,
	Layer,
	Option,
	Schema,
} from 'effect'
import { FetchHttpClient } from 'effect/http'
import {
	STORAGE_OPTION,
	storageKindSchema,
	toStorageLayer,
} from './storage-layer'

const platformLayer = Layer.mergeAll(BunFileSystem.layer, BunPath.layer)

describe('storageKindSchema', () => {
	it.each(['local', 'blob'])('accepts --storage %s', storage => {
		const { values } = parseArgs({
			args: ['--storage', storage],
			options: { storage: STORAGE_OPTION },
		})

		expect(Schema.decodeUnknownSync(storageKindSchema)(values.storage)).toBe(
			storage
		)
	})

	it('defaults --storage to local', () => {
		const { values } = parseArgs({
			args: [],
			options: { storage: STORAGE_OPTION },
		})

		expect(values.storage).toBe('local')
	})

	it.effect.each(['s3', '', 'LOCAL'])(
		'rejects %j and names both allowed storage kinds',
		storage =>
			Effect.gen(function* () {
				const error = yield* Effect.flip(
					Schema.decodeUnknownEffect(storageKindSchema)(storage)
				)

				expect(error).toMatchObject({ _tag: 'SchemaError' })
				expect(error.message).toContain('local')
				expect(error.message).toContain('blob')
			})
	)
})

describe('toStorageLayer', () => {
	it.live('roots local storage at the requested data directory', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const directory = yield* fs.makeTempDirectoryScoped()
			const dataDirectory = `${directory}/custom-data`
			const path = 'days/2026-10-03.json'
			const text = '{"count":3}'

			yield* Effect.gen(function* () {
				const storage = yield* JsonStorage

				expect(yield* storage.writeText(path, text)).toEqual({
					location: `${dataDirectory}/${path}`,
					bytes: Buffer.byteLength(text),
				})
				expect(yield* fs.readFileString(`${dataDirectory}/${path}`)).toBe(text)
				expect(yield* storage.readText(path)).toEqual(Option.some(text))
			}).pipe(
				Effect.provide(toStorageLayer({ storage: 'local', dataDirectory }))
			)
		}).pipe(
			Effect.provide(platformLayer),
			Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))
		)
	)

	it.effect(
		'wires blob reads through fetch and the configured public URL',
		() => {
			const requests: string[] = []
			const fetchStub = Object.assign(
				async (input: string | URL | Request) => {
					requests.push(input instanceof Request ? input.url : String(input))

					return new Response('{"count":3}')
				},
				{ preconnect: () => undefined }
			)

			return Effect.gen(function* () {
				const storage = yield* JsonStorage

				expect(yield* storage.readText('days/2026-10-03.json')).toEqual(
					Option.some('{"count":3}')
				)
				expect(requests).toEqual([
					'https://test.public.blob.vercel-storage.com/days/2026-10-03.json',
				])
			}).pipe(
				Effect.provide(
					toStorageLayer({
						storage: 'blob',
						dataDirectory: '/unused-local-directory',
					})
				),
				Effect.provide(platformLayer),
				Effect.provideService(FetchHttpClient.Fetch, fetchStub),
				Effect.provide(
					ConfigProvider.layer(
						ConfigProvider.fromUnknown({
							BLOB_BASE_URL: 'https://test.public.blob.vercel-storage.com',
						})
					)
				)
			)
		}
	)
})
