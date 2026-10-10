import type { SeasonId } from '@shared/schema/season-id'
import { Context, type Effect } from 'effect'
import type { SeasonEnrichment } from '../domain/enrichment'
import type { EnrichmentSourceError } from './enrichment-source.error'

/** Enrichment of a season as ranking needs it; scoring pass 1 gets an empty one. */
export interface EnrichmentSourceShape {
	readonly read: (
		seasonId: SeasonId
	) => Effect.Effect<SeasonEnrichment, EnrichmentSourceError>
}

export class EnrichmentSource extends Context.Service<
	EnrichmentSource,
	EnrichmentSourceShape
>()('ranking/EnrichmentSource') {}
