import type { SeasonId } from '@shared/schema/season-id'
import type { StoredFile } from '@shared/storage/json-storage.port'
import { Context, type Effect, type Option } from 'effect'
import type {
	BoardFile,
	ContributorBoardId,
	RepositoryBoardFile,
} from '../domain/files/board-file'
import type { CandidatesFile } from '../domain/files/candidates-file'
import type { SeasonIndex } from '../domain/files/season-index-file'
import type { ShardFile } from '../domain/files/shard-file'
import type { SeasonStoreError } from './season-store.error'

type Read<TValue> = Effect.Effect<Option.Option<TValue>, SeasonStoreError>
type Write = Effect.Effect<StoredFile, SeasonStoreError>

/** Typed access to the files ranking writes and the website reads. */
export interface SeasonStoreShape {
	readonly readIndex: () => Read<SeasonIndex>
	readonly writeIndex: (index: SeasonIndex) => Write
	readonly readBoard: (
		seasonId: SeasonId,
		board: ContributorBoardId
	) => Read<BoardFile>
	readonly writeBoard: (file: BoardFile) => Write
	readonly readRepositoryBoard: (
		seasonId: SeasonId
	) => Read<RepositoryBoardFile>
	readonly writeRepositoryBoard: (file: RepositoryBoardFile) => Write
	readonly readShard: (seasonId: SeasonId, shardKey: string) => Read<ShardFile>
	readonly writeShard: (shardKey: string, file: ShardFile) => Write
	readonly readCandidates: (seasonId: SeasonId) => Read<CandidatesFile>
	readonly writeCandidates: (file: CandidatesFile) => Write
}

export class SeasonStore extends Context.Service<
	SeasonStore,
	SeasonStoreShape
>()('ranking/SeasonStore') {}
