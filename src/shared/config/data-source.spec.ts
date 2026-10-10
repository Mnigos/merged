import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect } from 'effect'
import { dataDirectoryConfig, dataSourceConfig } from './data-source'

const parseWith = (env: Record<string, string>) =>
	Effect.all([
		dataSourceConfig.parse(ConfigProvider.fromEnvRecord(env)),
		dataDirectoryConfig.parse(ConfigProvider.fromEnvRecord(env)),
	])

describe('dataSourceConfig', () => {
	it.effect('defaults to local files under data without Blob', () =>
		Effect.gen(function* () {
			expect(yield* parseWith({})).toEqual(['local', 'data'])
		})
	)

	it.effect('defaults to Blob once BLOB_BASE_URL is set', () =>
		Effect.gen(function* () {
			expect(
				yield* parseWith({
					BLOB_BASE_URL: 'https://store.public.blob.vercel-storage.com',
				})
			).toEqual(['blob', 'data'])
		})
	)

	it.effect('lets DATA_SOURCE and DATA_DIR override the defaults', () =>
		Effect.gen(function* () {
			expect(
				yield* parseWith({
					DATA_SOURCE: 'local',
					DATA_DIR: 'fixtures',
					BLOB_BASE_URL: 'https://store.public.blob.vercel-storage.com',
				})
			).toEqual(['local', 'fixtures'])
		})
	)

	it.effect('rejects an unknown DATA_SOURCE', () =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip(
					dataSourceConfig.parse(
						ConfigProvider.fromEnvRecord({ DATA_SOURCE: 'ftp' })
					)
				)
			).toBeTruthy()
		})
	)
})
