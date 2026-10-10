import type { SeasonId } from '@shared/schema/season-id'
import { Context, Effect, Layer, type Option } from 'effect'
import type { CandidatesFile } from '../domain/files/candidates-file'
import type { SeasonStoreError } from './season-store.error'
import { SeasonStore } from './season-store.port'

export interface CandidatesShape {
	readonly read: (
		seasonId: SeasonId
	) => Effect.Effect<Option.Option<CandidatesFile>, SeasonStoreError>
}

/** Ranking's read side of scoring pass 1 candidates, for the `enrich` script. */
export class Candidates extends Context.Service<Candidates, CandidatesShape>()(
	'ranking/Candidates'
) {
	static readonly layer = Layer.effect(
		Candidates,
		Effect.gen(function* () {
			const store = yield* SeasonStore

			const read = Effect.fn('Candidates.read')(function* (seasonId: SeasonId) {
				return yield* store.readCandidates(seasonId)
			})

			return { read }
		})
	)
}
