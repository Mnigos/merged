import { isoDateSchema, type IsoDate } from '@shared/schema/iso-date'
import { seasonIdOf } from '@shared/schema/season-id'

const DAY_MS = 24 * 60 * 60 * 1000

const toTime = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`)
const toIsoDate = (time: number) =>
	isoDateSchema.make(new Date(time).toISOString().slice(0, 10))

/** The UTC day before the instant `nowMs`. */
export const yesterdayOf = (nowMs: number) => toIsoDate(nowMs - DAY_MS)

/** Every UTC day from `from` to `to`, both included; empty when `from` is after `to`. */
export function toDayRange(from: IsoDate, to: IsoDate): readonly IsoDate[] {
	const days: IsoDate[] = []
	for (let time = toTime(from); time <= toTime(to); time += DAY_MS)
		days.push(toIsoDate(time))

	return days
}

/**
 * The season that closed the day before `date` when `date` is the first of a
 * month, so the pipeline can finish it; `undefined` on any other day.
 */
export const closingSeasonOf = (date: IsoDate) =>
	date.endsWith('-01') ? seasonIdOf(new Date(toTime(date) - 1)) : undefined
