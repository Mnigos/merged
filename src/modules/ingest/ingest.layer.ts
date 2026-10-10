import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { Layer } from 'effect'
import { DailyAggregates } from './application/daily-aggregates.service'
import { IngestDay } from './application/ingest-day.service'
import { ghArchiveHttpSourceLayer } from './infrastructure/gh-archive-http-source'
import { jsonDayStoreLayer } from './infrastructure/json-day-store'

export interface IngestLayerOptions {
	readonly outDirectory: string
}

/**
 * `DailyAggregates` over whatever `JsonStorage` the composition root provides,
 * for modules that read daily aggregates.
 */
export const dailyAggregatesLayer = DailyAggregates.layer.pipe(
	Layer.provide(jsonDayStoreLayer)
)

/** Ingest wired to GH Archive over HTTP and daily aggregates on local disk. */
export const ingestLayer = ({ outDirectory }: IngestLayerOptions) =>
	IngestDay.layer.pipe(
		Layer.provide(
			Layer.mergeAll(
				ghArchiveHttpSourceLayer,
				jsonDayStoreLayer.pipe(
					Layer.provide(localFileJsonStorageLayer(outDirectory))
				)
			)
		)
	)
