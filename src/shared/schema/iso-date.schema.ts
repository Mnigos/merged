import { Schema } from 'effect'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

/** True when `YYYY-MM-DD` names a day that exists in the UTC calendar. */
function isCalendarDate(value: string) {
	const date = new Date(`${value}T00:00:00Z`)

	return (
		!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	)
}

export const isoDateSchema = Schema.String.pipe(
	Schema.check(
		Schema.isPattern(ISO_DATE_PATTERN),
		Schema.makeFilter(
			(value: string) =>
				!ISO_DATE_PATTERN.test(value) ||
				isCalendarDate(value) ||
				'must be a real calendar date'
		)
	),
	Schema.brand('IsoDate')
)
export type IsoDate = typeof isoDateSchema.Type
