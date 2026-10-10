import { Effect, Layer } from 'effect'
import { EnrichmentSource } from '../application/enrichment-source.port'
import { emptyEnrichment } from '../domain/enrichment'

/** `EnrichmentSource` of scoring pass 1: nothing enriched, archive proxies only. */
export const emptyEnrichmentSourceLayer = Layer.succeed(EnrichmentSource, {
	read: () => Effect.succeed(emptyEnrichment),
})
