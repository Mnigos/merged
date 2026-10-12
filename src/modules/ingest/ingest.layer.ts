import type { IngestSourceKind } from '@shared/config/ingest-source'
import { toGithubGraphqlHttpLayer } from '@shared/github/github-graphql-http'
import type { JsonStorage } from '@shared/storage/json-storage.port'
import { Effect, Layer } from 'effect'
import { DailyAggregates } from './application/daily-aggregates.service'
import { IngestDay } from './application/ingest-day.service'
import { MergeDayParts } from './application/merge-day-parts.service'
import { jsonDayPartStoreLayer } from './infrastructure/json-day-part-store'
import { jsonDayStoreLayer } from './infrastructure/json-day-store'
import { archiveIngestSourceLayer } from './infrastructure/sources/archive-ingest-source'
import { ghArchiveHttpSourceLayer } from './infrastructure/sources/gh-archive-http-source'
import {
	searchConcurrencyConfig,
	toGithubSearchIngestSourceLayer,
} from './infrastructure/sources/github-search-ingest-source'

/**
 * `DailyAggregates` over whatever `JsonStorage` the composition root provides,
 * for modules that read daily aggregates.
 */
export const dailyAggregatesLayer = DailyAggregates.layer.pipe(
	Layer.provide(jsonDayStoreLayer)
)

/**
 * The search source with its own GitHub GraphQL client, so its
 * `SEARCH_CONCURRENCY` queries in flight do not change the one-at-a-time
 * client enrichment uses. Needs `GITHUB_TOKEN`.
 */
const githubSearchIngestSourceLayer = Layer.unwrap(
	Effect.gen(function* () {
		const concurrency = yield* searchConcurrencyConfig

		return toGithubSearchIngestSourceLayer({ concurrency }).pipe(
			Layer.provide(toGithubGraphqlHttpLayer({ concurrency }))
		)
	})
)

const toIngestSourceLayer = (source: IngestSourceKind) =>
	source === 'search'
		? githubSearchIngestSourceLayer
		: archiveIngestSourceLayer.pipe(Layer.provide(ghArchiveHttpSourceLayer))

/**
 * Ingest reading hours from `source` (GH Archive or GitHub search) and
 * writing the JSON day and day part stores: `IngestDay` and
 * `DailyAggregates`. Needs `JsonStorage` and `HttpClient` from the
 * composition root.
 */
export const toIngestLayer = (source: IngestSourceKind) =>
	Layer.mergeAll(
		IngestDay.layer.pipe(Layer.provide(toIngestSourceLayer(source))),
		DailyAggregates.layer
	).pipe(
		Layer.provide(Layer.mergeAll(jsonDayStoreLayer, jsonDayPartStoreLayer))
	)

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
