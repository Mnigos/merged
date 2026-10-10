import { topShareOf } from '../domain/ranks'

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const SHARE_FORMAT = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 1,
})
const SEASON_FORMAT = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC',
})
const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	timeZone: 'UTC',
})
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	day: 'numeric',
	timeZone: 'UTC',
})
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('en-US', {
	numeric: 'auto',
})

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const toSeasonDate = (seasonId: string) => new Date(`${seasonId}-01T00:00:00Z`)

/** A count with thousands separators: `6853` → `6,853`. */
export const formatNumber = (value: number) => NUMBER_FORMAT.format(value)

/** The top share of a percentile without the word "top": `99.9` → `0.1%`, `97` → `3%`. */
export const formatTopPercent = (percentile: number) =>
	`${SHARE_FORMAT.format(topShareOf(percentile))}%`

/** A season's month and year: `2026-10` → `October 2026`. */
export const formatSeasonName = (seasonId: string) =>
	SEASON_FORMAT.format(toSeasonDate(seasonId))

/** A season's month alone: `2026-10` → `October`. */
export const formatSeasonMonth = (seasonId: string) =>
	MONTH_FORMAT.format(toSeasonDate(seasonId))

/** A UTC day as month and day: `2026-10-04` → `October 4`. */
export const formatDay = (isoDate: string) =>
	DAY_FORMAT.format(new Date(`${isoDate}T00:00:00Z`))

/** How long ago an instant was, coarse: `just now`, `12 minutes ago`, `3 hours ago`, `yesterday`. */
export function formatRelativeTime(isoDateTime: string, now: number) {
	const elapsed = Math.max(0, now - Date.parse(isoDateTime))
	if (elapsed < MINUTE) return 'just now'
	if (elapsed < HOUR)
		return RELATIVE_FORMAT.format(-Math.floor(elapsed / MINUTE), 'minute')
	if (elapsed < DAY)
		return RELATIVE_FORMAT.format(-Math.floor(elapsed / HOUR), 'hour')

	return RELATIVE_FORMAT.format(-Math.floor(elapsed / DAY), 'day')
}

/** How many times something happened: `once`, `twice`, `41 times`. */
export function formatTimes(count: number) {
	if (count === 1) return 'once'
	if (count === 2) return 'twice'

	return `${formatNumber(count)} times`
}

/** A count with its noun: `1 repository`, `8 repositories`. */
export const formatCount = (count: number, one: string, many: string) =>
	`${formatNumber(count)} ${count === 1 ? one : many}`
