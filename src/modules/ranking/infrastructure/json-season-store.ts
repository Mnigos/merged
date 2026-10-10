import type { SeasonId } from '@shared/schema/season-id'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { Effect, Layer, Option, Schema } from 'effect'
import { SeasonStoreError } from '../application/season-store.error'
import { SeasonStore } from '../application/season-store.port'
import {
	boardFileSchema,
	repositoryBoardFileSchema,
	type ContributorBoardId,
} from '../domain/files/board-file'
import { candidatesFileSchema } from '../domain/files/candidates-file'
import { seasonIndexSchema } from '../domain/files/season-index-file'
import { shardFileSchema } from '../domain/files/shard-file'

/** Storage path of the season index. */
export const SEASON_INDEX_PATH = 'seasons/index.json'

/** Storage path of a board file. */
export const toBoardPath = (
	seasonId: SeasonId,
	board: ContributorBoardId | 'repositories'
) => `seasons/${seasonId}/tabs/${board}.json`

/** Storage path of a shard file. */
export const toShardPath = (seasonId: SeasonId, shardKey: string) =>
	`seasons/${seasonId}/shards/${shardKey}.json`

/** Storage path of the candidates file. */
export const toCandidatesPath = (seasonId: SeasonId) =>
	`seasons/${seasonId}/candidates.json`

const toError = (path: string) => (cause: { readonly message: string }) =>
	new SeasonStoreError({ path, message: `${path}: ${cause.message}` })

/** `SeasonStore` on `JsonStorage`; every file is decoded with its Schema on read. */
export const jsonSeasonStoreLayer = Layer.effect(
	SeasonStore,
	Effect.gen(function* () {
		const storage = yield* JsonStorage

		const jsonFile = <TValue, TEncoded>(
			schema: Schema.Codec<TValue, TEncoded>
		) => {
			const jsonSchema = Schema.fromJsonString(schema)
			const encode = Schema.encodeEffect(jsonSchema)
			const decode = Schema.decodeUnknownEffect(jsonSchema)

			return {
				read: (path: string) =>
					storage.readText(path).pipe(
						Effect.flatMap(text =>
							Option.isNone(text)
								? Effect.succeed(Option.none<TValue>())
								: decode(text.value).pipe(Effect.map(Option.some))
						),
						Effect.mapError(toError(path))
					),
				write: (path: string, value: TValue) =>
					encode(value).pipe(
						Effect.flatMap(text => storage.writeText(path, text)),
						Effect.mapError(toError(path))
					),
			}
		}

		const index = jsonFile(seasonIndexSchema)
		const board = jsonFile(boardFileSchema)
		const repositoryBoard = jsonFile(repositoryBoardFileSchema)
		const shard = jsonFile(shardFileSchema)
		const candidates = jsonFile(candidatesFileSchema)

		return {
			readIndex: () => index.read(SEASON_INDEX_PATH),
			writeIndex: file => index.write(SEASON_INDEX_PATH, file),
			readBoard: (seasonId, boardId) =>
				board.read(toBoardPath(seasonId, boardId)),
			writeBoard: file =>
				board.write(toBoardPath(file.season, file.board), file),
			readRepositoryBoard: seasonId =>
				repositoryBoard.read(toBoardPath(seasonId, 'repositories')),
			writeRepositoryBoard: file =>
				repositoryBoard.write(toBoardPath(file.season, 'repositories'), file),
			readShard: (seasonId, shardKey) =>
				shard.read(toShardPath(seasonId, shardKey)),
			writeShard: (shardKey, file) =>
				shard.write(toShardPath(file.season, shardKey), file),
			readCandidates: seasonId => candidates.read(toCandidatesPath(seasonId)),
			writeCandidates: file =>
				candidates.write(toCandidatesPath(file.season), file),
		}
	})
)
