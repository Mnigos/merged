import { Layer } from 'effect'
import { DailyAggregates } from './application/daily-aggregates.service'
import { IngestDay } from './application/ingest-day.service'
import { ghArchiveHttpSourceLayer } from './infrastructure/gh-archive-http-source'
import { jsonDayStoreLayer } from './infrastructure/json-day-store'

/**
 * `DailyAggregates` over whatever `JsonStorage` the composition root provides,
 * for modules that read daily aggregates.
 */
export const dailyAggregatesLayer = DailyAggregates.layer.pipe(
	Layer.provide(jsonDayStoreLayer)
)

/**
 * Ingest wired to GH Archive and the JSON day store: `IngestDay` and
 * `DailyAggregates`. Needs `JsonStorage` and `HttpClient` from the
 * composition root.
 */
export const ingestLayer = Layer.mergeAll(
	IngestDay.layer.pipe(Layer.provide(ghArchiveHttpSourceLayer)),
	DailyAggregates.layer
).pipe(Layer.provide(jsonDayStoreLayer))
