import { ALL_HOURS } from '@modules/ingest/application/ingest-day.service'
import { Result } from 'effect'
import { InvalidHoursError } from './invalid-hours.error'

const LAST_HOUR = 23
const HOUR_PATTERN = /^\d{1,2}$/u
const RANGE_PATTERN = /^(\d+)-(\d+)$/u

const toHour = (token: string) => {
	if (!HOUR_PATTERN.test(token)) return undefined
	const hour = Number(token)

	return hour <= LAST_HOUR ? hour : undefined
}

const invalid = (input: string, reason: string) =>
	Result.fail(
		new InvalidHoursError({
			input,
			message: `--hours "${input}": ${reason}; use a range like 0-23 or a list like 1,5,9`,
		})
	)

/**
 * Parses the `--hours` flag: omitted means every hour, `a-b` an inclusive range,
 * `a,b,c` a list. Every hour is a decimal integer in 0–23; anything else fails.
 */
export function parseHours(
	input: string | undefined
): Result.Result<readonly number[], InvalidHoursError> {
	if (input === undefined) return Result.succeed(ALL_HOURS)

	const range = RANGE_PATTERN.exec(input)
	if (range) {
		const first = toHour(range[1] ?? '')
		const last = toHour(range[2] ?? '')
		if (first === undefined || last === undefined)
			return invalid(input, 'range ends must be hours 0-23')
		if (first > last) return invalid(input, 'range start is after its end')

		return Result.succeed(
			Array.from({ length: last - first + 1 }, (_, index) => first + index)
		)
	}

	const hours = input.split(',').map(toHour)
	if (hours.some(hour => hour === undefined))
		return invalid(input, 'every hour must be a whole number 0-23')

	return Result.succeed(hours.filter(hour => hour !== undefined))
}
