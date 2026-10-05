import { Schema } from 'effect'

export const isoDateSchema = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
	Schema.brand('IsoDate')
)
export type IsoDate = typeof isoDateSchema.Type
