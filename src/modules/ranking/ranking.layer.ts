import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { seasonProfilesLayer } from '@modules/profiles/profiles.layer'
import { Layer } from 'effect'
import { BuildSeason } from './application/build-season.service'
import { Candidates } from './application/candidates.service'
import { jsonSeasonStoreLayer } from './infrastructure/json-season-store'
import { profilesEnrichmentSourceLayer } from './infrastructure/profiles-enrichment-source'

/**
 * `Candidates` over whatever `JsonStorage` the composition root provides, for
 * the `enrich` script that hands them to profiles.
 */
export const candidatesLayer = Candidates.layer.pipe(
	Layer.provide(jsonSeasonStoreLayer)
)

/**
 * `BuildSeason` over whatever `JsonStorage` the composition root provides:
 * daily aggregates through ingest's `DailyAggregates`, enrichment through
 * profiles' `SeasonProfiles` (scoring pass 2 once `enrich` ran, pass 1
 * otherwise), season files through the JSON season store.
 */
export const rankingLayer = BuildSeason.layer.pipe(
	Layer.provide(
		Layer.mergeAll(
			jsonSeasonStoreLayer,
			dailyAggregatesLayer,
			profilesEnrichmentSourceLayer.pipe(Layer.provide(seasonProfilesLayer))
		)
	)
)
