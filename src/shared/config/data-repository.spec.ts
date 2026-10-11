import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect } from 'effect'
import {
	DEFAULT_DATA_REPOSITORY,
	dataRepositoryConfig,
} from './data-repository'

const parseWith = (env: Record<string, string>) =>
	dataRepositoryConfig.parse(ConfigProvider.fromEnvRecord(env))

describe('dataRepositoryConfig', () => {
	it.effect('reads owner/name', () =>
		Effect.gen(function* () {
			expect(yield* parseWith({ DATA_REPOSITORY: 'Mnigos/merged-data' })).toBe(
				'Mnigos/merged-data'
			)
		})
	)

	it.effect.each([
		'foo',
		'merged-data',
		'a/b/c',
		'Mnigos/',
		'/merged-data',
		'a b/c',
	])('rejects %j', repository =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip(parseWith({ DATA_REPOSITORY: repository }))
			).toMatchObject({ _tag: 'ConfigError' })
		})
	)

	it.effect('defaults to this repository when unset', () =>
		Effect.gen(function* () {
			expect(DEFAULT_DATA_REPOSITORY).toBe('Mnigos/merged')
			expect(yield* parseWith({})).toBe(DEFAULT_DATA_REPOSITORY)
		})
	)

	it.effect('names DATA_REPOSITORY when it is invalid', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				parseWith({ DATA_REPOSITORY: 'merged-data' })
			)

			expect(error).toMatchObject({ _tag: 'ConfigError' })
			expect(error.message).toContain('DATA_REPOSITORY')
		})
	)
})
