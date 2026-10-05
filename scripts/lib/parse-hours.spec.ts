import { describe, expect, it } from '@effect/vitest'
import { ALL_HOURS } from '@modules/ingest/application/ingest-day.service'
import { Result } from 'effect'
import { parseHours } from './parse-hours'

describe('parseHours', () => {
	it('selects every hour when the flag is omitted', () => {
		expect(parseHours(undefined)).toEqual(Result.succeed(ALL_HOURS))
	})

	it('parses a single hour, a list and a range', () => {
		expect(parseHours('15')).toEqual(Result.succeed([15]))
		expect(parseHours('1,5,9')).toEqual(Result.succeed([1, 5, 9]))
		expect(parseHours('0-3')).toEqual(Result.succeed([0, 1, 2, 3]))
		expect(parseHours('23-23')).toEqual(Result.succeed([23]))
	})

	it.each(['', ',', '1,', ',1', '1,,2', ' 1', '1.5', '-1', 'a', '+1', '0x1'])(
		'rejects the list token in %j',
		input => {
			expect(Result.isFailure(parseHours(input))).toBe(true)
		}
	)

	it.each(['24', '1,24', '0-24', '0-999999999', '999999999-1', '5-2'])(
		'rejects out-of-range hours in %j before expanding them',
		input => {
			expect(Result.isFailure(parseHours(input))).toBe(true)
		}
	)

	it('names the range ends in the error for an oversized range', () => {
		expect(Result.merge(parseHours('0-999999999')).toString()).toContain(
			'range ends'
		)
	})

	it('reports the input in a tagged error', () => {
		expect(Result.merge(parseHours('1,'))).toMatchObject({
			_tag: 'InvalidHoursError',
			input: '1,',
		})
	})
})
