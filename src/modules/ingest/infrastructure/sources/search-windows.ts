import type { IsoDate } from '@shared/schema/iso-date'

/** Seconds of a search window before any split: one minute. */
export const SEARCH_WINDOW_SECONDS = 60

const HOUR_SECONDS = 3600

/**
 * A range of whole UTC seconds searched as `merged:<start>..<end>`, both
 * ends inclusive, as epoch seconds.
 */
export interface SearchWindow {
	readonly start: number
	readonly end: number
}

/** Length of a window in seconds, both ends counted. */
export const toWindowSeconds = ({ start, end }: SearchWindow) => end - start + 1

/**
 * The hour as one-minute windows, `10:00:00..10:00:59`, `10:01:00..10:01:59`,
 * …: together they cover every second of the hour once, so no merge falls
 * between two windows or into both.
 */
export function toHourWindows(date: IsoDate, hour: number): SearchWindow[] {
	const hourStart = Date.parse(`${date}T00:00:00Z`) / 1000 + hour * HOUR_SECONDS

	return Array.from(
		{ length: HOUR_SECONDS / SEARCH_WINDOW_SECONDS },
		(_, index) => {
			const start = hourStart + index * SEARCH_WINDOW_SECONDS

			return { start, end: start + SEARCH_WINDOW_SECONDS - 1 }
		}
	)
}

/** The two halves of a window, the first one second shorter when its length is odd. */
export function splitSearchWindow(
	window: SearchWindow
): readonly [SearchWindow, SearchWindow] {
	const middle = window.start + Math.floor(toWindowSeconds(window) / 2)

	return [
		{ start: window.start, end: middle - 1 },
		{ start: middle, end: window.end },
	]
}

const toSearchInstant = (seconds: number) =>
	new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')

/** A window as `2026-10-01T10:00:00Z..2026-10-01T10:00:59Z`, for search, logs and errors. */
export const toWindowRange = (window: SearchWindow) =>
	`${toSearchInstant(window.start)}..${toSearchInstant(window.end)}`

/** Search query of the public pull requests merged in a window. */
export const toSearchQuery = (window: SearchWindow) =>
	`is:pr is:merged is:public merged:${toWindowRange(window)}`
