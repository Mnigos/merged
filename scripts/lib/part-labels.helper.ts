import { ALL_HOURS } from '@modules/ingest/application/ingest-day.service'
import { Result } from 'effect'
import { InvalidPartsError } from './invalid-parts.error'
import { parseHours } from './parse-hours.helper'

const invalid = (input: string, message: string) =>
	Result.fail(new InvalidPartsError({ input, message }))

/**
 * Label of the day part `ingest-day --part` writes: the `--hours` value, a
 * range `a-b` or one hour. Lists are refused because `merge-day --parts`
 * joins labels with commas.
 */
export function toPartLabel(
	hours: string | undefined
): Result.Result<string, InvalidPartsError> {
	if (hours === undefined)
		return invalid('', '--part needs --hours, a range like 0-5')
	if (hours.includes(','))
		return invalid(
			hours,
			`--part needs --hours as a range like 0-5 or one hour, not the list "${hours}"`
		)

	return Result.succeed(hours)
}

/**
 * Splits `merge-day --parts` into day part labels and checks that together
 * they cover every hour 0–23 exactly once.
 */
export function parsePartLabels(
	input: string | undefined
): Result.Result<readonly string[], InvalidPartsError> {
	if (!input)
		return invalid('', '--parts is required, for example 0-5,6-11,12-17,18-23')

	const labels = input.split(',')
	const partOfHour = new Map<number, string>()
	for (const label of labels) {
		const hours = parseHours(label)
		if (Result.isFailure(hours))
			return invalid(input, `--parts "${input}": ${hours.failure.message}`)
		for (const hour of hours.success) {
			const other = partOfHour.get(hour)
			if (other !== undefined)
				return invalid(
					input,
					`--parts "${input}": hour ${hour} is in both ${other} and ${label}`
				)
			partOfHour.set(hour, label)
		}
	}
	const missing = ALL_HOURS.filter(hour => !partOfHour.has(hour))
	if (missing.length > 0)
		return invalid(
			input,
			`--parts "${input}": hours ${missing.join(', ')} are in no part`
		)

	return Result.succeed(labels)
}
