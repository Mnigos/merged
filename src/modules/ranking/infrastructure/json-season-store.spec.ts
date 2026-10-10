import { describe, expect, it } from '@effect/vitest'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { StorageError } from '@shared/storage/storage.error'
import { Effect, Layer, Option } from 'effect'
import { SeasonStore } from '../application/season-store.port'
import { buildBoards } from '../domain/boards'
import { selectCandidates } from '../domain/candidates'
import { scoreSeason } from '../domain/score-season'
import { toSeasonIndexEntry, upsertSeasonIndex } from '../domain/season-index'
import { buildShards, shardKeyOf } from '../domain/shards'
import {
	computedAt,
	seasonId,
	toEnrichment,
	toSeason,
} from '../testing/season.mock'
import {
	jsonSeasonStoreLayer,
	SEASON_INDEX_PATH,
	toBoardPath,
	toCandidatesPath,
	toShardPath,
} from './json-season-store'

const season = toSeason({
	date: '2026-10-01',
	rows: [
		{ author: 'alice', repository: 'acme/widgets', pullRequests: [1] },
		{ author: 'bob', repository: 'acme/widgets', pullRequests: [2] },
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
const aliceShardKey = shardKeyOf('alice')
const aliceShard = Option.getOrThrow(
	Option.fromNullishOr(shards.get(aliceShardKey))
)
const index = upsertSeasonIndex(
	undefined,
	toSeasonIndexEntry({ season, scored, now: new Date(computedAt) })
)
const candidates = {
	season: seasonId,
	computedAt,
	...selectCandidates({ season, scored }, { contributors: 10 }),
}

const storeOver = (files: Map<string, string>) =>
	jsonSeasonStoreLayer.pipe(Layer.provide(inMemoryJsonStorageLayer(files)))

describe('jsonSeasonStoreLayer', () => {
	it('places every file under seasons/', () => {
		expect(SEASON_INDEX_PATH).toBe('seasons/index.json')
		expect(toBoardPath(seasonId, 'poland')).toBe(
			'seasons/2026-10/tabs/poland.json'
		)
		expect(toBoardPath(seasonId, 'repositories')).toBe(
			'seasons/2026-10/tabs/repositories.json'
		)
		expect(toShardPath(seasonId, '0a')).toBe('seasons/2026-10/shards/0a.json')
		expect(toCandidatesPath(seasonId)).toBe('seasons/2026-10/candidates.json')
	})

	it.effect('writes every file at its path and reads it back decoded', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			const store = yield* SeasonStore
			yield* store.writeIndex(index)
			yield* store.writeBoard(boards.global)
			yield* store.writeBoard(boards.poland)
			yield* store.writeRepositoryBoard(boards.repositories)
			yield* store.writeShard(aliceShardKey, aliceShard)
			yield* store.writeCandidates(candidates)

			expect([...files.keys()].toSorted()).toEqual(
				[
					'seasons/index.json',
					'seasons/2026-10/tabs/global.json',
					'seasons/2026-10/tabs/poland.json',
					'seasons/2026-10/tabs/repositories.json',
					`seasons/2026-10/shards/${aliceShardKey}.json`,
					'seasons/2026-10/candidates.json',
				].toSorted()
			)
			expect(yield* store.readIndex()).toEqual(Option.some(index))
			expect(yield* store.readBoard(seasonId, 'global')).toEqual(
				Option.some(boards.global)
			)
			expect(yield* store.readBoard(seasonId, 'poland')).toEqual(
				Option.some(boards.poland)
			)
			expect(yield* store.readRepositoryBoard(seasonId)).toEqual(
				Option.some(boards.repositories)
			)
			expect(yield* store.readShard(seasonId, aliceShardKey)).toEqual(
				Option.some(aliceShard)
			)
			expect(yield* store.readCandidates(seasonId)).toEqual(
				Option.some(candidates)
			)
		}).pipe(Effect.provide(storeOver(files)))
	})

	it.effect('reads files that were never written as none', () =>
		Effect.gen(function* () {
			const store = yield* SeasonStore

			expect(yield* store.readIndex()).toEqual(Option.none())
			expect(yield* store.readShard(seasonId, '00')).toEqual(Option.none())
			expect(yield* store.readCandidates(seasonId)).toEqual(Option.none())
		}).pipe(Effect.provide(storeOver(new Map())))
	)

	it.effect('tolerates fields added by a later file version', () =>
		Effect.gen(function* () {
			const store = yield* SeasonStore

			expect(Option.isSome(yield* store.readIndex())).toBe(true)
		}).pipe(
			Effect.provide(
				storeOver(
					new Map([
						[
							SEASON_INDEX_PATH,
							JSON.stringify({ ...index, generator: 'v2', extra: [1] }),
						],
					])
				)
			)
		)
	)

	it.effect.each([
		['{', 'malformed JSON'],
		['{"latest":"2026-13","seasons":[]}', 'an impossible season'],
		['{"latest":null,"seasons":[{"id":"2026-10"}]}', 'a truncated entry'],
	])('fails with SeasonStoreError on %j (%s)', ([text]) =>
		Effect.gen(function* () {
			const store = yield* SeasonStore

			expect(yield* Effect.flip(store.readIndex())).toMatchObject({
				_tag: 'SeasonStoreError',
				path: SEASON_INDEX_PATH,
			})
		}).pipe(
			Effect.provide(storeOver(new Map([[SEASON_INDEX_PATH, text ?? '']])))
		)
	)

	it.effect('translates storage failures into SeasonStoreError', () =>
		Effect.gen(function* () {
			const store = yield* SeasonStore

			const writeError = yield* Effect.flip(store.writeBoard(boards.global))

			expect(writeError).toMatchObject({
				_tag: 'SeasonStoreError',
				path: 'seasons/2026-10/tabs/global.json',
			})
			expect(writeError.message).toContain('disk full')
			expect(yield* Effect.flip(store.readIndex())).toMatchObject({
				_tag: 'SeasonStoreError',
			})
		}).pipe(
			Effect.provide(
				jsonSeasonStoreLayer.pipe(
					Layer.provide(
						Layer.succeed(JsonStorage, {
							readText: path =>
								Effect.fail(new StorageError({ path, message: 'disk full' })),
							writeText: path =>
								Effect.fail(new StorageError({ path, message: 'disk full' })),
						})
					)
				)
			)
		)
	)
})
