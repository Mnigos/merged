import { Effect, Layer } from 'effect'
import { EnrichmentSource } from '../application/enrichment-source.port'
import type { SeasonEnrichment } from '../domain/enrichment'

/** Test `EnrichmentSource` returning the same enrichment for every season. */
export const inMemoryEnrichmentSourceLayer = (enrichment: SeasonEnrichment) =>
	Layer.succeed(EnrichmentSource, {
		read: () => Effect.succeed(enrichment),
	})
