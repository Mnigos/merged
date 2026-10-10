import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { Layer } from 'effect'
import { BuildSeason } from './application/build-season.service'
import { emptyEnrichmentSourceLayer } from './infrastructure/empty-enrichment-source'
import { jsonSeasonStoreLayer } from './infrastructure/json-season-store'

export interface RankingLayerOptions {
	readonly dataDirectory: string
}

/**
 * Ranking wired for scoring pass 1 on local disk: daily aggregates through
 * ingest's `DailyAggregates`, season files through the JSON season store, both under
 * `dataDirectory`, and no enrichment yet.
 */
export const rankingLayer = ({ dataDirectory }: RankingLayerOptions) =>
	BuildSeason.layer.pipe(
		Layer.provide(
			Layer.mergeAll(
				jsonSeasonStoreLayer,
				dailyAggregatesLayer,
				emptyEnrichmentSourceLayer
			)
		),
		Layer.provide(localFileJsonStorageLayer(dataDirectory))
	)
