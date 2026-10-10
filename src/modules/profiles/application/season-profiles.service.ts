import type { SeasonId } from '@shared/schema/season-id'
import { Context, Effect, Layer, type Option } from 'effect'
import type { ContributorsFile } from '../domain/files/contributors-file'
import type { MergersFile } from '../domain/files/mergers-file'
import type { RepositoriesFile } from '../domain/files/repositories-file'
import type { ProfileStoreError } from './profile-store.error'
import { ProfileStore } from './profile-store.port'

/** A season's enrichment files; each is none until `enrich` ran for the season. */
export interface SeasonProfilesFiles {
	readonly repositories: Option.Option<RepositoriesFile>
	readonly contributors: Option.Option<ContributorsFile>
	readonly mergers: Option.Option<MergersFile>
}

export interface SeasonProfilesShape {
	readonly read: (
		seasonId: SeasonId
	) => Effect.Effect<SeasonProfilesFiles, ProfileStoreError>
}

/** Profiles' read side for other modules: the season's enrichment files. */
export class SeasonProfiles extends Context.Service<
	SeasonProfiles,
	SeasonProfilesShape
>()('profiles/SeasonProfiles') {
	static readonly layer = Layer.effect(
		SeasonProfiles,
		Effect.gen(function* () {
			const store = yield* ProfileStore

			const read = Effect.fn('SeasonProfiles.read')(function* (
				seasonId: SeasonId
			) {
				return yield* Effect.all(
					{
						repositories: store.readRepositories(seasonId),
						contributors: store.readContributors(seasonId),
						mergers: store.readMergers(seasonId),
					},
					{ concurrency: 'unbounded' }
				)
			})

			return { read }
		})
	)
}
