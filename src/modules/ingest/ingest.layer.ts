import type { JsonStorage } from '@shared/storage/json-storage.port'
import { Layer } from 'effect'
import { DailyAggregates } from './application/daily-aggregates.service'
import { IngestDay } from './application/ingest-day.service'
import { MergeDayParts } from './application/merge-day-parts.service'
import { ghArchiveHttpSourceLayer } from './infrastructure/gh-archive-http-source'
import { jsonDayPartStoreLayer } from './infrastructure/json-day-part-store'
import { jsonDayStoreLayer } from './infrastructure/json-day-store'

/**
 * `DailyAggregates` over whatever `JsonStorage` the composition root provides,
 * for modules that read daily aggregates.
 */
export const dailyAggregatesLayer = DailyAggregates.layer.pipe(
	Layer.provide(jsonDayStoreLayer)
)

/**
 * Ingest wired to GH Archive and the JSON day and day part stores:
 * `IngestDay` and `DailyAggregates`. Needs `JsonStorage` and `HttpClient`
 * from the composition root.
 */
export const ingestLayer = Layer.mergeAll(
	IngestDay.layer.pipe(Layer.provide(ghArchiveHttpSourceLayer)),
	DailyAggregates.layer
).pipe(Layer.provide(Layer.mergeAll(jsonDayStoreLayer, jsonDayPartStoreLayer)))

/**
 * `MergeDayParts` reading day parts from `partsStorage` and writing the day
 * file through the `JsonStorage` of the composition root.
 */
export const toMergeDayPartsLayer = <TError, TRequirements>(
	partsStorage: Layer.Layer<JsonStorage, TError, TRequirements>
) =>
	MergeDayParts.layer.pipe(
		Layer.provide(
			Layer.mergeAll(
				jsonDayPartStoreLayer.pipe(Layer.provide(partsStorage)),
				jsonDayStoreLayer
			)
		)
	)
