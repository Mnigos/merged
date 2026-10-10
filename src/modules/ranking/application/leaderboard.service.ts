import type { SeasonId } from '@shared/schema/season-id'
import { Context, Effect, Layer, Option } from 'effect'
import type {
	BoardFile,
	ContributorBoardId,
	RepositoryBoardFile,
} from '../domain/files/board-file'
import type { SeasonIndex } from '../domain/files/season-index-file'
import type { ShardEntry } from '../domain/files/shard-file'
import { shardKeyOf } from '../domain/shards'
import type { SeasonStoreError } from './season-store.error'
import { SeasonStore } from './season-store.port'

type Read<TValue> = Effect.Effect<Option.Option<TValue>, SeasonStoreError>

export interface LeaderboardShape {
	readonly index: () => Read<SeasonIndex>
	readonly board: (
		seasonId: SeasonId,
		board: ContributorBoardId
	) => Read<BoardFile>
	readonly repositories: (seasonId: SeasonId) => Read<RepositoryBoardFile>
	/** A contributor's shard entry by login, compared lowercase. */
	readonly contributor: (seasonId: SeasonId, login: string) => Read<ShardEntry>
}

/** Ranking's read side for the website: the season index, boards and one contributor's result. */
export class Leaderboard extends Context.Service<
	Leaderboard,
	LeaderboardShape
>()('ranking/Leaderboard') {
	static readonly layer = Layer.effect(
		Leaderboard,
		Effect.gen(function* () {
			const store = yield* SeasonStore

			const index = Effect.fn('Leaderboard.index')(function* () {
				return yield* store.readIndex()
			})

			const board = Effect.fn('Leaderboard.board')(function* (
				seasonId: SeasonId,
				boardId: ContributorBoardId
			) {
				return yield* store.readBoard(seasonId, boardId)
			})

			const repositories = Effect.fn('Leaderboard.repositories')(function* (
				seasonId: SeasonId
			) {
				return yield* store.readRepositoryBoard(seasonId)
			})

			const contributor = Effect.fn('Leaderboard.contributor')(function* (
				seasonId: SeasonId,
				login: string
			) {
				const key = login.toLowerCase()
				const shard = yield* store.readShard(seasonId, shardKeyOf(key))

				if (Option.isNone(shard) || !Object.hasOwn(shard.value.entries, key))
					return Option.none<ShardEntry>()

				return Option.fromNullishOr(shard.value.entries[key])
			})

			return { index, board, repositories, contributor }
		})
	)
}
