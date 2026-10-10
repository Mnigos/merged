import { describe, expect, it } from '@effect/vitest'
import { computedAt, toEnrichment, toSeason } from '../testing/season.mock'
import { BOARD_SIZE, buildBoards, rankPoland, TOP_REPOSITORIES } from './boards'
import { emptyEnrichment } from './enrichment'
import { scoreSeason } from './score-season'

const season = toSeason({
	date: '2026-10-01',
	rows: [
		{ author: 'alice', repository: 'acme/widgets', pullRequests: [1, 2, 3, 4] },
		{ author: 'alice', repository: 'acme/gadgets', pullRequests: [5] },
		{ author: 'alice', repository: 'tiny/a', pullRequests: [6] },
		{ author: 'alice', repository: 'tiny/b', pullRequests: [7] },
		{ author: 'bob', repository: 'acme/widgets', pullRequests: [8] },
		{ author: 'carol', repository: 'acme/widgets', pullRequests: [9] },
		{ author: 'carol', repository: 'acme/gadgets', merged: 0, selfMerged: 1 },
		{ author: 'dan', repository: 'acme/gadgets', pullRequests: [10] },
	],
	stars: { 'acme/widgets': 40 },
})

const enrichment = toEnrichment({
	contributors: {
		bob: { name: 'Bob', location: 'Kraków, Poland' },
		carol: { location: 'Warsaw' },
		dan: { location: 'Portland' },
	},
	repositories: { 'acme/widgets': { stars: 5000, language: 'TypeScript' } },
})

describe('buildBoards', () => {
	const scored = scoreSeason(season, enrichment)
	const boards = buildBoards({ season, scored, enrichment, computedAt })

	it('builds the global board with every ranked contributor counted', () => {
		expect(boards.global).toMatchObject({
			season: '2026-10',
			board: 'global',
			computedAt,
			contributors: 4,
		})
		expect(boards.global.rows.map(row => [row.rank, row.login])).toEqual([
			[1, 'alice'],
			[2, 'carol'],
			[3, 'bob'],
			[4, 'dan'],
		])
	})

	it('fills a row with counts, the top three repositories and the profile', () => {
		const [alice] = boards.global.rows

		expect(alice).toMatchObject({
			login: 'alice',
			mergedPullRequests: 7,
			selfMergedPullRequests: 0,
			repositories: 4,
			name: null,
			location: null,
		})
		expect(alice?.topRepositories).toHaveLength(TOP_REPOSITORIES)
		expect(
			alice?.topRepositories.map(repository => repository.counted)
		).toEqual([true, true, false])
		expect(alice?.topRepositories[0]).toMatchObject({
			repository: 'acme/widgets',
			mergedPullRequests: 4,
		})
		expect(boards.global.rows.find(row => row.login === 'bob')).toMatchObject({
			name: 'Bob',
			location: 'Kraków, Poland',
		})
	})

	it('ranks the Poland board among Polish locations only, with its own ranks', () => {
		expect(boards.poland).toMatchObject({ board: 'poland', contributors: 2 })
		expect(
			boards.poland.rows.map(row => [row.rank, row.login, row.percentile])
		).toEqual([
			[1, 'carol', scored.ranked[1]?.percentile],
			[2, 'bob', scored.ranked[2]?.percentile],
		])
		expect([...boards.polandRanks]).toEqual([
			['carol', 1],
			['bob', 2],
		])
	})

	it('ranks repositories by contributors, then merged PRs, with enrichment', () => {
		expect(boards.repositories).toMatchObject({
			board: 'repositories',
			season: '2026-10',
		})
		expect(boards.repositories.rows).toEqual([
			{
				rank: 1,
				repository: 'acme/widgets',
				contributors: 3,
				mergedPullRequests: 6,
				starsInSeason: 40,
				stars: 5000,
				language: 'TypeScript',
			},
			{
				rank: 2,
				repository: 'acme/gadgets',
				contributors: 3,
				mergedPullRequests: 3,
				starsInSeason: 0,
				stars: null,
				language: null,
			},
			{
				rank: 3,
				repository: 'tiny/a',
				contributors: 1,
				mergedPullRequests: 1,
				starsInSeason: 0,
				stars: null,
				language: null,
			},
			{
				rank: 3,
				repository: 'tiny/b',
				contributors: 1,
				mergedPullRequests: 1,
				starsInSeason: 0,
				stars: null,
				language: null,
			},
		])
	})

	it('uses competition ranks within Poland even when global ranks differ', () => {
		const tiedSeason = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'leader', repository: 'org/repo', merged: 9 },
				{ author: 'amy', repository: 'org/repo', merged: 4 },
				{ author: 'bob', repository: 'org/repo', merged: 4 },
				{ author: 'carol', repository: 'org/repo', merged: 1 },
			],
		})
		const profiles = toEnrichment({
			contributors: {
				leader: { location: 'Plymouth' },
				amy: { location: '🇵🇱' },
				bob: { location: 'PL' },
				carol: { location: 'Lodz' },
			},
		})
		const tiedBoards = buildBoards({
			season: tiedSeason,
			scored: scoreSeason(tiedSeason, profiles),
			enrichment: profiles,
			computedAt,
		})

		expect(tiedBoards.global.rows.map(row => [row.login, row.rank])).toEqual([
			['leader', 1],
			['amy', 2],
			['bob', 2],
			['carol', 4],
		])
		expect(
			tiedBoards.poland.rows.map(row => [row.login, row.rank, row.percentile])
		).toEqual([
			['amy', 1, 25],
			['bob', 1, 25],
			['carol', 3, 0],
		])
	})

	it('selects the three highest-scoring counted repositories before uncounted ones', () => {
		const diverse = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'a/uncounted', merged: 100 },
				{ author: 'alice', repository: 'b/low', merged: 1 },
				{ author: 'alice', repository: 'c/middle', merged: 4 },
				{ author: 'alice', repository: 'd/high', merged: 9 },
				{ author: 'alice', repository: 'e/highest', merged: 16 },
			],
			stars: { 'b/low': 3, 'c/middle': 3, 'd/high': 3, 'e/highest': 3 },
		})
		const diverseBoards = buildBoards({
			season: diverse,
			scored: scoreSeason(diverse, emptyEnrichment),
			enrichment: emptyEnrichment,
			computedAt,
		})

		expect(diverseBoards.global.rows[0]?.topRepositories).toEqual([
			{
				repository: 'e/highest',
				mergedPullRequests: 16,
				counted: true,
				score: 458,
			},
			{
				repository: 'd/high',
				mergedPullRequests: 9,
				counted: true,
				score: 344,
			},
			{
				repository: 'c/middle',
				mergedPullRequests: 4,
				counted: true,
				score: 229,
			},
		])
	})

	it('keeps the Poland board empty without enrichment', () => {
		expect(
			rankPoland(scoreSeason(season, emptyEnrichment), emptyEnrichment)
		).toEqual([])
	})

	it('truncates boards to the top 100 but counts every contributor', () => {
		const crowded = toSeason({
			date: '2026-10-01',
			rows: Array.from({ length: BOARD_SIZE + 5 }, (_, index) => ({
				author: `user-${String(index).padStart(3, '0')}`,
				repository: `repo/${index}`,
				pullRequests: [1],
			})),
			stars: Object.fromEntries(
				Array.from({ length: BOARD_SIZE + 5 }, (_, index) => [
					`repo/${index}`,
					3,
				])
			),
		})
		const locations = toEnrichment({
			contributors: Object.fromEntries(
				[...crowded.contributors.keys()].map(name => [name, { location: 'PL' }])
			),
		})
		const crowdedBoards = buildBoards({
			season: crowded,
			scored: scoreSeason(crowded, locations),
			enrichment: locations,
			computedAt,
		})

		expect(crowdedBoards.global.rows).toHaveLength(BOARD_SIZE)
		expect(crowdedBoards.global.contributors).toBe(BOARD_SIZE + 5)
		expect(crowdedBoards.global.rows.every(row => row.rank === 1)).toBe(true)
		expect(crowdedBoards.repositories.rows).toHaveLength(BOARD_SIZE)
		expect(crowdedBoards.global.rows.map(row => row.login)).toEqual(
			Array.from(
				{ length: 100 },
				(_, index) => `user-${String(index).padStart(3, '0')}`
			)
		)
		expect(crowdedBoards.poland.rows).toHaveLength(100)
		expect(crowdedBoards.poland.contributors).toBe(105)
		expect([...crowdedBoards.polandRanks.values()]).toEqual(
			Array.from({ length: 105 }, () => 1)
		)
	})
})
