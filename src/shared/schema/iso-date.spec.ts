import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { isoDateSchema } from './iso-date'

const decode = Schema.decodeUnknownResult(isoDateSchema)

describe('isoDateSchema', () => {
	it.each(['2026-10-03', '2026-01-01', '2026-12-31', '2024-02-29'])(
		'accepts the calendar date %s',
		value => {
			expect(Result.getOrThrow(decode(value))).toBe(value)
		}
	)

	it.each([
		'2023-02-29',
		'2026-02-30',
		'2026-13-01',
		'2026-13-45',
		'2026-04-31',
		'2026-00-10',
		'2026-10-00',
	])('rejects the impossible date %s', value => {
		expect(String(Result.merge(decode(value)))).toContain(
			'must be a real calendar date'
		)
	})

	it.each(['2026-1-03', '20261003', '2026-10-03T00:00:00Z', ''])(
		'rejects %j by pattern',
		value => {
			expect(Result.isFailure(decode(value))).toBe(true)
		}
	)
})
