import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { seasonProfilesLayer } from '@modules/profiles/profiles.layer'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { Layer } from 'effect'
import { BuildSeason } from './application/build-season.service'
import { Candidates } from './application/candidates.service'
import { jsonSeasonStoreLayer } from './infrastructure/json-season-store'
import { profilesEnrichmentSourceLayer } from './infrastructure/profiles-enrichment-source'

export interface RankingLayerOptions {
	readonly dataDirectory: string
}

/**
 * `Candidates` over whatever `JsonStorage` the composition root provides, for
 * the `enrich` script that hands them to profiles.
 */
export const candidatesLayer = Candidates.layer.pipe(
	Layer.provide(jsonSeasonStoreLayer)
)

/**
 * Ranking on local disk under `dataDirectory`: daily aggregates through
 * ingest's `DailyAggregates`, enrichment through profiles' `SeasonProfiles`
 * (scoring pass 2 once `enrich` ran, pass 1 otherwise), season files through
 * the JSON season store.
 */
export const rankingLayer = ({ dataDirectory }: RankingLayerOptions) =>
	BuildSeason.layer.pipe(
		Layer.provide(
			Layer.mergeAll(
				jsonSeasonStoreLayer,
				dailyAggregatesLayer,
				profilesEnrichmentSourceLayer.pipe(Layer.provide(seasonProfilesLayer))
			)
		),
		Layer.provide(localFileJsonStorageLayer(dataDirectory))
	)
