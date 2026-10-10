import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { isoDateSchema } from './iso-date'
import {
	daysInMonth,
	daysInSeason,
	seasonEndsAt,
	seasonIdOf,
	seasonIdSchema,
	seasonOfDate,
} from './season-id'

const decode = Schema.decodeUnknownResult(seasonIdSchema)
const season = seasonIdSchema.make

describe('seasonIdSchema', () => {
	it.each(['2026-10', '2026-01', '2026-02', '2026-12', '1999-02'])(
		'accepts the month %s',
		value => {
			expect(Result.getOrThrow(decode(value))).toBe(value)
		}
	)

	it.each(['2026-00', '2026-13', '2026-99'])(
		'rejects the impossible month %s',
		value => {
			expect(String(Result.merge(decode(value)))).toContain(
				'must be a real calendar month'
			)
		}
	)

	it.each(['2026-1', '202610', '2026-10-01', '', 'abcd-10'])(
		'rejects %j by pattern',
		value => {
			expect(Result.isFailure(decode(value))).toBe(true)
		}
	)
})

describe('season helpers', () => {
	it('finds the season of a day and of an instant in UTC', () => {
		expect(seasonOfDate(isoDateSchema.make('2026-10-31'))).toBe('2026-10')
		expect(seasonIdOf(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10')
		expect(seasonIdOf(new Date('2026-11-01T00:30:00+02:00'))).toBe('2026-10')
	})

	it('counts days per month, leap years included', () => {
		expect(daysInMonth(season('2026-10'))).toBe(31)
		expect(daysInMonth(season('2026-11'))).toBe(30)
		expect(daysInMonth(season('2026-02'))).toBe(28)
		expect(daysInMonth(season('2028-02'))).toBe(29)
		expect(daysInMonth(season('2100-02'))).toBe(28)
	})

	it('lists every day of the season in order', () => {
		const days = daysInSeason(season('2026-02'))

		expect(days).toHaveLength(28)
		expect(days[0]).toBe('2026-02-01')
		expect(days.at(-1)).toBe('2026-02-28')
		expect(daysInSeason(season('2026-12')).at(-1)).toBe('2026-12-31')
	})

	it('includes every day of leap-year February exactly once in order', () => {
		expect(daysInSeason(season('2024-02'))).toEqual(
			Array.from(
				{ length: 29 },
				(_, index) => `2024-02-${String(index + 1).padStart(2, '0')}`
			)
		)
		expect(seasonEndsAt(season('2024-02')).toISOString()).toBe(
			'2024-03-01T00:00:00.000Z'
		)
	})

	it('ends a season at midnight UTC of the next month, across years', () => {
		expect(seasonEndsAt(season('2026-10')).toISOString()).toBe(
			'2026-11-01T00:00:00.000Z'
		)
		expect(seasonEndsAt(season('2026-12')).toISOString()).toBe(
			'2027-01-01T00:00:00.000Z'
		)
	})
})
