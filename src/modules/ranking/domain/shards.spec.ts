import { describe, expect, it } from '@effect/vitest'
import {
	computedAt,
	login,
	seasonId,
	toEnrichment,
	toSeason,
} from '../testing/season.mock'
import { buildBoards } from './boards'
import { emptyEnrichment } from './enrichment'
import { scoreSeason } from './score-season'
import { buildShards, SHARD_COUNT, SHARD_KEYS, shardKeyOf } from './shards'

describe('shardKeyOf', () => {
	it('takes the low 10 bits of the FNV-1a 32-bit hash', () => {
		expect(shardKeyOf('')).toBe('1c5')
		expect(shardKeyOf('a')).toBe('12c')
		expect(shardKeyOf('foobar')).toBe('168')
	})

	it('ignores case', () => {
		expect(shardKeyOf('Mnigos')).toBe(shardKeyOf('mnigos'))
	})

	it('always returns three lowercase hex characters from 000 to 3ff', () => {
		for (const name of ['torvalds', 'sindresorhus', 'x', 'dependabot[bot]'])
			expect(shardKeyOf(name)).toMatch(/^[0-3][\da-f]{2}$/u)
	})

	it('spreads logins over the shards', () => {
		const used = new Set(
			Array.from({ length: 20_000 }, (_, index) => shardKeyOf(`user${index}`))
		)

		expect(used.size).toBe(SHARD_COUNT)
	})
})

describe('buildShards', () => {
	const season = toSeason({
		date: '2026-10-01',
		rows: [
			{ author: 'alice', repository: 'acme/widgets', pullRequests: [1, 2] },
			{ author: 'alice', repository: 'tiny/tool', pullRequests: [3] },
			{ author: 'bob', repository: 'acme/widgets', pullRequests: [4] },
			{ author: 'renovate-ish', repository: 'acme/widgets', pullRequests: [5] },
			{ author: 'loner', repository: 'loner/solo', pullRequests: [6] },
		],
	})
	const enrichment = toEnrichment({
		contributors: {
			alice: { name: 'Alice', location: 'Gdańsk' },
			'renovate-ish': { isBot: true },
		},
		mergers: { 'acme/widgets#2': 'alice' },
	})
	const scored = scoreSeason(season, enrichment)
	const { polandRanks } = buildBoards({
		season,
		scored,
		enrichment,
		computedAt,
	})
	const shards = buildShards({
		seasonId,
		scored,
		polandRanks,
		enrichment,
		computedAt,
	})
	const entryOf = (name: string) =>
		shards.get(shardKeyOf(name))?.entries[login(name)]

	it('writes all 1024 shards, empty ones included', () => {
		expect(SHARD_KEYS).toEqual(
			Array.from({ length: 1024 }, (_, index) =>
				index.toString(16).padStart(3, '0')
			)
		)
		expect([...shards.keys()]).toEqual(SHARD_KEYS)
		expect(shards.get(SHARD_KEYS[0] ?? '')).toMatchObject({
			season: '2026-10',
			computedAt,
		})
		expect(
			[...shards.values()].reduce(
				(total, shard) => total + Object.keys(shard.entries).length,
				0
			)
		).toBe(4)
	})

	it('builds every empty shard with season metadata when there are no contributors', () => {
		const empty = buildShards({
			seasonId,
			scored: { ranked: [], excluded: [] },
			polandRanks: new Map(),
			enrichment: emptyEnrichment,
			computedAt,
		})

		expect([...empty.keys()]).toEqual(SHARD_KEYS)
		for (const shard of empty.values())
			expect(shard).toEqual({ season: seasonId, computedAt, entries: {} })
	})

	it('stores a ranked contributor with boards, repositories and profile', () => {
		const alice = scored.ranked.find(
			contributor => contributor.login === 'alice'
		)

		expect(entryOf('alice')).toEqual({
			login: 'alice',
			rank: alice?.rank,
			percentile: alice?.percentile,
			score: alice?.score,
			mergedPullRequests: 2,
			selfMergedPullRequests: 1,
			boards: { poland: 1 },
			repositories: alice?.repositories.map(repository => ({
				repository: repository.repository,
				mergedPullRequests: repository.merged,
				selfMergedPullRequests: repository.selfMerged,
				standing: repository.standing,
				counted: repository.counted,
				score: repository.score,
			})),
			name: 'Alice',
			location: 'Gdańsk',
			excluded: null,
		})
	})

	it('stores an excluded bot without rank so lookup can explain', () => {
		expect(entryOf('renovate-ish')).toMatchObject({
			rank: null,
			percentile: null,
			excluded: 'bot',
			boards: { poland: null },
		})
	})

	it('stores a contributor without a counted repository so lookup can explain', () => {
		expect(entryOf('loner')).toMatchObject({
			rank: null,
			percentile: null,
			score: 0,
			excluded: 'noCountedRepository',
			repositories: [{ repository: 'loner/solo', counted: false, score: 0 }],
		})
	})

	it('leaves the Poland rank empty outside Poland', () => {
		expect(entryOf('bob')).toMatchObject({
			boards: { poland: null },
			name: null,
			location: null,
			excluded: null,
		})
	})
})
