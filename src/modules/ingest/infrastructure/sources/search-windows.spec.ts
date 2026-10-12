import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import {
	SEARCH_WINDOW_SECONDS,
	splitSearchWindow,
	toHourWindows,
	toSearchQuery,
	toWindowRange,
	toWindowSeconds,
} from './search-windows'

const date = isoDateSchema.make('2026-10-01')

describe('toHourWindows', () => {
	const windows = toHourWindows(date, 10)

	it('splits the hour into one-minute windows', () => {
		expect(windows).toHaveLength(60)
		expect(windows.map(toWindowSeconds)).toEqual(
			Array.from({ length: 60 }, () => SEARCH_WINDOW_SECONDS)
		)
		expect(toWindowRange(windows[0] ?? { start: 0, end: 0 })).toBe(
			'2026-10-01T10:00:00Z..2026-10-01T10:00:59Z'
		)
		expect(toWindowRange(windows[59] ?? { start: 0, end: 0 })).toBe(
			'2026-10-01T10:59:00Z..2026-10-01T10:59:59Z'
		)
	})

	it('covers every second of the hour once, without overlap or gap', () => {
		const hourStart = Date.parse('2026-10-01T10:00:00Z') / 1000

		expect(windows[0]?.start).toBe(hourStart)
		expect(windows.at(-1)?.end).toBe(hourStart + 3599)
		for (const [index, window] of windows.entries())
			if (index > 0)
				expect(window.start).toBe((windows[index - 1]?.end ?? 0) + 1)
	})

	it('starts hour 0 at midnight UTC of the date', () => {
		expect(
			toWindowRange(toHourWindows(date, 0)[0] ?? { start: 0, end: 0 })
		).toBe('2026-10-01T00:00:00Z..2026-10-01T00:00:59Z')
	})
})

describe('splitSearchWindow', () => {
	const [minute] = toHourWindows(date, 10)
	const window = minute ?? { start: 0, end: 0 }

	it('halves a minute into two 30-second windows that do not overlap', () => {
		expect(splitSearchWindow(window).map(toWindowRange)).toEqual([
			'2026-10-01T10:00:00Z..2026-10-01T10:00:29Z',
			'2026-10-01T10:00:30Z..2026-10-01T10:00:59Z',
		])
	})

	it('makes the first half one second shorter for an odd length', () => {
		const [first, second] = splitSearchWindow({
			start: window.start,
			end: window.start + 14,
		})

		expect([toWindowSeconds(first), toWindowSeconds(second)]).toEqual([7, 8])
		expect(second.start).toBe(first.end + 1)
	})

	it('splits two seconds into two single seconds', () => {
		expect(
			splitSearchWindow({ start: window.start, end: window.start + 1 })
		).toEqual([
			{ start: window.start, end: window.start },
			{ start: window.start + 1, end: window.start + 1 },
		])
	})
})

describe('toSearchQuery', () => {
	it('searches public merged pull requests of the window with second precision', () => {
		expect(
			toSearchQuery(toHourWindows(date, 3)[1] ?? { start: 0, end: 0 })
		).toBe(
			'is:pr is:merged is:public merged:2026-10-01T03:01:00Z..2026-10-01T03:01:59Z'
		)
	})
})
