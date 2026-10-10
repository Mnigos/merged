import { Schema } from 'effect'
import { isoDateSchema, type IsoDate } from './iso-date'

const SEASON_ID_PATTERN = /^\d{4}-\d{2}$/u

/** True when the month part of `YYYY-MM` is 01–12. */
function isCalendarMonth(value: string) {
	const month = Number(value.slice(5, 7))

	return month >= 1 && month <= 12
}

/** A season: one UTC calendar month, `YYYY-MM`. */
export const seasonIdSchema = Schema.String.pipe(
	Schema.check(
		Schema.isPattern(SEASON_ID_PATTERN),
		Schema.makeFilter(
			(value: string) =>
				!SEASON_ID_PATTERN.test(value) ||
				isCalendarMonth(value) ||
				'must be a real calendar month'
		)
	),
	Schema.brand('SeasonId')
)
export type SeasonId = typeof seasonIdSchema.Type

const toParts = (seasonId: SeasonId) => ({
	year: Number(seasonId.slice(0, 4)),
	monthIndex: Number(seasonId.slice(5, 7)) - 1,
})

/** The season a UTC day belongs to. */
export const seasonOfDate = (date: IsoDate) =>
	seasonIdSchema.make(date.slice(0, 7))

/** The season of an instant, in UTC. */
export const seasonIdOf = (date: Date) =>
	seasonIdSchema.make(date.toISOString().slice(0, 7))

/** Number of days in the season's month, leap years included. */
export function daysInMonth(seasonId: SeasonId) {
	const { year, monthIndex } = toParts(seasonId)

	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** Every calendar day of the season, in order. */
export const daysInSeason = (seasonId: SeasonId): readonly IsoDate[] =>
	Array.from({ length: daysInMonth(seasonId) }, (_, index) =>
		isoDateSchema.make(`${seasonId}-${String(index + 1).padStart(2, '0')}`)
	)

/** The first instant after the season, midnight UTC of the next month's first day. */
export function seasonEndsAt(seasonId: SeasonId) {
	const { year, monthIndex } = toParts(seasonId)

	return new Date(Date.UTC(year, monthIndex + 1, 1))
}
