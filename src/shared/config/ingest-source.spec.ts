import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect } from 'effect'
import { ingestSourceConfig } from './ingest-source'

const parseWith = (env: Record<string, string>) =>
	ingestSourceConfig.parse(ConfigProvider.fromEnvRecord(env))

describe('ingestSourceConfig', () => {
	it.effect('defaults to the archive', () =>
		Effect.gen(function* () {
			expect(yield* parseWith({})).toBe('archive')
		})
	)

	it.effect.each(['archive', 'search'] as const)(
		'reads INGEST_SOURCE=%s',
		source =>
			Effect.gen(function* () {
				expect(yield* parseWith({ INGEST_SOURCE: source })).toBe(source)
			})
	)

	it.effect('rejects an unknown source', () =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip(parseWith({ INGEST_SOURCE: 'bigquery' }))
			).toMatchObject({ _tag: 'ConfigError' })
		})
	)
})
