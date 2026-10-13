import { Schema } from 'effect'

const ISO_DATE_TIME_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/u

/** A UTC instant in `Date#toISOString` format. */
export const isoDateTimeSchema = Schema.String.pipe(
	Schema.check(Schema.isPattern(ISO_DATE_TIME_PATTERN))
)
