import type { SeasonId } from '@shared/schema/season-id'
import type { StoredFile } from '@shared/storage/json-storage.port'
import { Context, type Effect, type Option } from 'effect'
import type { ContributorsFile } from '../domain/files/contributors-file'
import type { MergersFile } from '../domain/files/mergers-file'
import type { RepositoriesFile } from '../domain/files/repositories-file'
import type { ProfileStoreError } from './profile-store.error'

type Read<TValue> = Effect.Effect<Option.Option<TValue>, ProfileStoreError>
type Write = Effect.Effect<StoredFile, ProfileStoreError>

/** Typed access to the season files profiles writes. */
export interface ProfileStoreShape {
	readonly readRepositories: (seasonId: SeasonId) => Read<RepositoriesFile>
	readonly writeRepositories: (file: RepositoriesFile) => Write
	readonly readContributors: (seasonId: SeasonId) => Read<ContributorsFile>
	readonly writeContributors: (file: ContributorsFile) => Write
	readonly readMergers: (seasonId: SeasonId) => Read<MergersFile>
	readonly writeMergers: (file: MergersFile) => Write
}

export class ProfileStore extends Context.Service<
	ProfileStore,
	ProfileStoreShape
>()('profiles/ProfileStore') {}
