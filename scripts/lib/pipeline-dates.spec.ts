import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { closingSeasonOf, toDayRange, yesterdayOf } from './pipeline-dates'

const day = isoDateSchema.make

describe('yesterdayOf', () => {
	it('returns the previous UTC day, across a year', () => {
		expect(yesterdayOf(Date.parse('2026-10-10T06:00:00Z'))).toBe('2026-10-09')
		expect(yesterdayOf(Date.parse('2027-01-01T00:00:00Z'))).toBe('2026-12-31')
	})
})

describe('toDayRange', () => {
	it('lists every day of a range across a month end', () => {
		expect(toDayRange(day('2026-09-29'), day('2026-10-02'))).toEqual([
			'2026-09-29',
			'2026-09-30',
			'2026-10-01',
			'2026-10-02',
		])
	})

	it('has one day when both ends match and none when reversed', () => {
		expect(toDayRange(day('2026-10-03'), day('2026-10-03'))).toEqual([
			'2026-10-03',
		])
		expect(toDayRange(day('2026-10-04'), day('2026-10-03'))).toEqual([])
	})
})

describe('closingSeasonOf', () => {
	it('names the previous season on the first of a month', () => {
		expect(closingSeasonOf(day('2026-10-01'))).toBe('2026-09')
		expect(closingSeasonOf(day('2026-01-01'))).toBe('2025-12')
	})

	it('is undefined on other days', () => {
		expect(closingSeasonOf(day('2026-10-02'))).toBeUndefined()
		expect(closingSeasonOf(day('2026-10-31'))).toBeUndefined()
	})
})
