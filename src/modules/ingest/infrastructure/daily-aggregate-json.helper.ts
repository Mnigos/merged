import { Schema } from 'effect'
import { dailyAggregateSchema } from '../domain/daily-aggregate.model'

const dailyAggregateJsonSchema = Schema.fromJsonString(dailyAggregateSchema)

/** Encodes a daily aggregate as the JSON text of its file. */
export const encodeDailyAggregateJson = Schema.encodeEffect(
	dailyAggregateJsonSchema
)

/** Decodes and validates the JSON text of a daily aggregate file. */
export const decodeDailyAggregateJson = Schema.decodeUnknownEffect(
	dailyAggregateJsonSchema
)
