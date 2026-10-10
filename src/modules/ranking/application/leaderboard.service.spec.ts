import { describe, expect, it } from '@effect/vitest'
import { seasonIdSchema } from '@shared/schema/season-id'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { Effect, Layer, Option } from 'effect'
import { buildBoards } from '../domain/boards'
import { scoreSeason } from '../domain/score-season'
import { toSeasonIndexEntry, upsertSeasonIndex } from '../domain/season-index'
import { buildShards, shardKeyOf } from '../domain/shards'
import {
	jsonSeasonStoreLayer,
	SEASON_INDEX_PATH,
	toBoardPath,
	toShardPath,
} from '../infrastructure/json-season-store'
import {
	computedAt,
	seasonId,
	toEnrichment,
	toSeason,
} from '../testing/season.mock'
import { Leaderboard } from './leaderboard.service'

const season = toSeason({
	date: '2026-10-01',
	rows: [
		{ author: 'alice', repository: 'acme/widgets', pullRequests: [1, 2] },
		{ author: 'bob', repository: 'acme/widgets', pullRequests: [3] },
		{ author: 'carol', repository: 'carol-friend/tool', pullRequests: [4] },
	],
})
const enrichment = toEnrichment({
	contributors: { bob: { location: 'Poznań', isBot: false } },
})
const scored = scoreSeason(season, enrichment)
const boards = buildBoards({ season, scored, enrichment, computedAt })
const shards = buildShards({
	seasonId,
	scored,
	polandRanks: boards.polandRanks,
	enrichment,
	computedAt,
})
const index = upsertSeasonIndex(
	undefined,
	toSeasonIndexEntry({ season, scored, now: new Date(computedAt) })
)

const seasonFiles = () =>
	new Map([
		[SEASON_INDEX_PATH, JSON.stringify(index)],
		[toBoardPath(seasonId, 'global'), JSON.stringify(boards.global)],
		[toBoardPath(seasonId, 'poland'), JSON.stringify(boards.poland)],
		[
			toBoardPath(seasonId, 'repositories'),
			JSON.stringify(boards.repositories),
		],
		...[...shards].map(
			([key, file]) =>
				[toShardPath(seasonId, key), JSON.stringify(file)] as const
		),
	])

const leaderboardOver = (files: Map<string, string>) =>
	Leaderboard.layer.pipe(
		Layer.provide(jsonSeasonStoreLayer),
		Layer.provide(inMemoryJsonStorageLayer(files))
	)

describe('Leaderboard', () => {
	it.effect('reads exactly the lowercased login shard', () => {
		const files = seasonFiles()
		const reads: string[] = []
		const storage = Layer.succeed(JsonStorage, {
			readText: path =>
				Effect.sync(() => {
					reads.push(path)
					return Option.fromNullishOr(files.get(path))
				}),
			writeText: () => Effect.die('Unexpected write during contributor lookup'),
		})

		return Effect.gen(function* () {
			expect(
				yield* (yield* Leaderboard).contributor(seasonId, 'ALIce')
			).toMatchObject(Option.some({ login: 'alice', rank: 1 }))
			expect(reads).toEqual([toShardPath(seasonId, shardKeyOf('alice'))])
		}).pipe(
			Effect.provide(
				Leaderboard.layer.pipe(
					Layer.provide(jsonSeasonStoreLayer),
					Layer.provide(storage)
				)
			)
		)
	})

	it.effect('returns none when only the requested shard is missing', () => {
		const files = seasonFiles()
		files.delete(toShardPath(seasonId, shardKeyOf('alice')))

		return Effect.gen(function* () {
			const leaderboard = yield* Leaderboard
			expect(yield* leaderboard.contributor(seasonId, 'Alice')).toEqual(
				Option.none()
			)
			expect(yield* leaderboard.board(seasonId, 'global')).toEqual(
				Option.some(boards.global)
			)
		}).pipe(Effect.provide(leaderboardOver(files)))
	})

	it.layer(leaderboardOver(seasonFiles()))(layerIt => {
		layerIt.effect(
			'does not return another season board for an unknown season',
			() =>
				Effect.gen(function* () {
					expect(
						yield* (yield* Leaderboard).board(
							seasonIdSchema.make('2026-09'),
							'global'
						)
					).toEqual(Option.none())
				})
		)

		layerIt.effect('does not match __proto__ in an existing empty shard', () =>
			Effect.gen(function* () {
				expect(shards.has(shardKeyOf('__proto__'))).toBe(true)
				expect(
					yield* (yield* Leaderboard).contributor(seasonId, '__proto__')
				).toEqual(Option.none())
			})
		)
		layerIt.effect('reads the season index', () =>
			Effect.gen(function* () {
				expect(yield* (yield* Leaderboard).index()).toEqual(Option.some(index))
			})
		)

		layerIt.effect('reads a contributor board and the repository board', () =>
			Effect.gen(function* () {
				const leaderboard = yield* Leaderboard

				expect(yield* leaderboard.board(seasonId, 'poland')).toEqual(
					Option.some(boards.poland)
				)
				expect(yield* leaderboard.repositories(seasonId)).toEqual(
					Option.some(boards.repositories)
				)
			})
		)

		layerIt.effect('finds a contributor in their shard, any casing', () =>
			Effect.gen(function* () {
				const leaderboard = yield* Leaderboard

				expect(yield* leaderboard.contributor(seasonId, 'Alice')).toMatchObject(
					Option.some({ login: 'alice', rank: 1 })
				)
			})
		)

		layerIt.effect('returns none for a login nobody merged as', () =>
			Effect.gen(function* () {
				const leaderboard = yield* Leaderboard

				expect(yield* leaderboard.contributor(seasonId, 'dave')).toEqual(
					Option.none()
				)
			})
		)

		layerIt.effect(
			'does not mistake an object prototype key for a contributor',
			() =>
				Effect.gen(function* () {
					const leaderboard = yield* Leaderboard

					expect(
						yield* leaderboard.contributor(seasonId, 'constructor')
					).toEqual(Option.none())
				})
		)
	})

	it.effect('returns none for a season without files', () =>
		Effect.gen(function* () {
			const leaderboard = yield* Leaderboard

			expect(yield* leaderboard.index()).toEqual(Option.none())
			expect(yield* leaderboard.board(seasonId, 'global')).toEqual(
				Option.none()
			)
			expect(yield* leaderboard.contributor(seasonId, 'alice')).toEqual(
				Option.none()
			)
		}).pipe(Effect.provide(leaderboardOver(new Map())))
	)

	it.effect('fails with a store error when a shard cannot be decoded', () =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip((yield* Leaderboard).contributor(seasonId, 'alice'))
			).toMatchObject({
				_tag: 'SeasonStoreError',
				path: toShardPath(seasonId, shardKeyOf('alice')),
			})
		}).pipe(
			Effect.provide(
				leaderboardOver(
					new Map([[toShardPath(seasonId, shardKeyOf('alice')), '{']])
				)
			)
		)
	)
})
