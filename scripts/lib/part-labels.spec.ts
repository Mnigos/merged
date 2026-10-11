import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { parsePartLabels, toPartLabel } from './part-labels'

describe('toPartLabel', () => {
	it('uses a range or a single hour as the label', () => {
		expect(toPartLabel('0-5')).toEqual(Result.succeed('0-5'))
		expect(toPartLabel('7')).toEqual(Result.succeed('7'))
	})

	it.each([undefined, '1,5,9'])(
		'refuses %j, which has no comma-free label',
		hours => {
			expect(Result.merge(toPartLabel(hours))).toMatchObject({
				_tag: 'InvalidPartsError',
			})
		}
	)
})

describe('parsePartLabels', () => {
	it('accepts labels that cover every hour once, in any order', () => {
		expect(parsePartLabels('0-5,6-11,12-17,18-23')).toEqual(
			Result.succeed(['0-5', '6-11', '12-17', '18-23'])
		)
		expect(parsePartLabels('12-23,0-11')).toEqual(
			Result.succeed(['12-23', '0-11'])
		)
		expect(parsePartLabels('0-23')).toEqual(Result.succeed(['0-23']))
	})

	it.each([
		[undefined, 'required'],
		['', 'required'],
		['0-5,6-11,12-17', 'hours 18, 19, 20, 21, 22, 23 are in no part'],
		['0-12,12-23', 'hour 12 is in both 0-12 and 12-23'],
		['0-11,12-23,12-23', 'hour 12 is in both 12-23 and 12-23'],
		['0-11,,12-23', 'every hour must be a whole number 0-23'],
		['0-11,12-24', 'range ends must be hours 0-23'],
	])('rejects %j: %s', (input, reason) => {
		const error = Result.merge(parsePartLabels(input))

		expect(error).toMatchObject({ _tag: 'InvalidPartsError' })
		expect(error.toString()).toContain(reason)
	})
})
