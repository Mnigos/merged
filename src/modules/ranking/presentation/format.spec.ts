import { describe, expect, it } from '@effect/vitest'
import {
	formatCount,
	formatDay,
	formatNumber,
	formatRelativeTime,
	formatSeasonMonth,
	formatSeasonName,
	formatTimes,
	formatTopPercent,
} from './format'

describe('formatNumber', () => {
	it.each([
		[0, '0'],
		[999, '999'],
		[6853, '6,853'],
		[1_284_902, '1,284,902'],
	])('formats %d as %s', (value, formatted) => {
		expect(formatNumber(value)).toBe(formatted)
	})
})

describe('formatTopPercent', () => {
	it.each([
		[99.9, '0.1%'],
		[97, '3%'],
		[97.3, '2.7%'],
		[100, '0.1%'],
		[99.99, '0.1%'],
		[101, '0.1%'],
		[97.26, '2.7%'],
		[0, '100%'],
	])('formats percentile %d as %s', (percentile, formatted) => {
		expect(formatTopPercent(percentile)).toBe(formatted)
	})
})

describe('season names', () => {
	it('names the season by month and year', () => {
		expect(formatSeasonName('2026-10')).toBe('October 2026')
		expect(formatSeasonName('2027-01')).toBe('January 2027')
	})

	it('names the month alone', () => {
		expect(formatSeasonMonth('2026-12')).toBe('December')
	})

	it('names a day by month and day in UTC', () => {
		expect(formatDay('2026-10-04')).toBe('October 4')
		expect(formatDay('2026-10-31')).toBe('October 31')
	})
})

describe('formatRelativeTime', () => {
	const now = Date.parse('2026-10-10T18:00:00Z')

	it.each([
		['2026-10-10T17:59:30Z', 'just now'],
		['2026-10-10T17:59:00Z', '1 minute ago'],
		['2026-10-10T17:32:00Z', '28 minutes ago'],
		['2026-10-10T16:00:00Z', '2 hours ago'],
		['2026-10-09T18:00:00Z', 'yesterday'],
		['2026-10-10T17:48:00Z', '12 minutes ago'],
		['2026-10-10T16:14:26Z', '1 hour ago'],
		['2026-10-10T08:00:00Z', '10 hours ago'],
		['2026-10-09T17:00:00Z', 'yesterday'],
		['2026-10-06T18:00:00Z', '4 days ago'],
		['2026-10-10T18:05:00Z', 'just now'],
	])('describes %s as %s', (instant, formatted) => {
		expect(formatRelativeTime(instant, now)).toBe(formatted)
	})
})

describe('formatTimes and formatCount', () => {
	it.each([
		[1, 'once'],
		[2, 'twice'],
		[41, '41 times'],
		[1200, '1,200 times'],
	])('says %d as %s', (count, formatted) => {
		expect(formatTimes(count)).toBe(formatted)
	})

	it('picks the noun by count', () => {
		expect(formatCount(1, 'repository', 'repositories')).toBe('1 repository')
		expect(formatCount(8, 'repository', 'repositories')).toBe('8 repositories')
	})
})
