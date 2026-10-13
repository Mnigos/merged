import { describe, expect, it } from '@effect/vitest'
import {
	computedAt,
	login,
	toEnrichment,
	toSeason,
} from '../testing/season.mock'
import {
	BOARD_SIZE,
	buildBoards,
	COUNTRY_BOARD_MIN_CONTRIBUTORS,
	rankCountries,
	TOP_REPOSITORIES,
} from './boards.helper'
import { emptyEnrichment } from './enrichment.model'
import { scoreSeason } from './score-season.helper'

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

	it('gives no country a board below the threshold, and nobody a country rank', () => {
		expect(boards.countries).toEqual([])
		expect(boards.countryRanks.size).toBe(0)
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
		expect(crowdedBoards.countries).toHaveLength(1)
		expect(crowdedBoards.countries[0]?.rows).toHaveLength(100)
		expect(crowdedBoards.countries[0]?.contributors).toBe(105)
		expect([...crowdedBoards.countryRanks.values()]).toEqual(
			Array.from({ length: 105 }, () => ({ code: 'pl', rank: 1 }))
		)
	})
})

interface CountrySeasonInput {
	/** Location of each contributor, best first; each merges one fewer pull request than the one before. */
	readonly locations: readonly (string | null)[]
	/** Pull requests merged by contributors at these indexes, to make ties. */
	readonly merged?: Readonly<Record<number, number>>
}

/** A season whose contributors are named `user-00`, `user-01`, … in the order of `locations`. */
function toCountrySeason({ locations, merged = {} }: CountrySeasonInput) {
	const names = locations.map(
		(_, index) => `user-${String(index).padStart(2, '0')}`
	)
	const countrySeason = toSeason({
		date: '2026-10-01',
		rows: names.map((author, index) => ({
			author,
			repository: 'org/repo',
			merged: merged[index] ?? locations.length - index,
		})),
		stars: { 'org/repo': 3 },
	})
	const countryEnrichment = toEnrichment({
		contributors: Object.fromEntries(
			names.map((name, index) => [name, { location: locations[index] ?? null }])
		),
	})

	return {
		scored: scoreSeason(countrySeason, countryEnrichment),
		countrySeason,
		countryEnrichment,
	}
}

const POLISH_LOCATIONS = [
	'Warsaw, Poland',
	'Kraków',
	'Wroclaw, PL',
	'🇵🇱',
	'Gdańsk',
	'Polska',
	'Łódź',
	'Poznan',
	'Remote (Szczecin)',
	'Berlin -> Katowice',
] as const

const tens = (location: string) =>
	Array.from({ length: COUNTRY_BOARD_MIN_CONTRIBUTORS }, () => location)

describe('rankCountries', () => {
	it('publishes a country only from the threshold of ranked contributors', () => {
		const germans = Array.from(
			{ length: COUNTRY_BOARD_MIN_CONTRIBUTORS - 1 },
			() => 'Berlin, Germany'
		)
		const { scored, countryEnrichment } = toCountrySeason({
			locations: [...POLISH_LOCATIONS, ...germans, 'Portland', null],
		})
		const countries = rankCountries(scored, countryEnrichment)

		expect(COUNTRY_BOARD_MIN_CONTRIBUTORS).toBe(10)
		expect([...countries.keys()]).toEqual(['pl'])
		expect(
			countries.get('pl')?.map(({ contributor }) => contributor.login)
		).toEqual(
			POLISH_LOCATIONS.map(
				(_, index) => `user-${String(index).padStart(2, '0')}`
			)
		)
	})

	it('orders countries by contributors, then code', () => {
		const { scored, countryEnrichment } = toCountrySeason({
			locations: [
				...tens('Tokyo'),
				...tens('Paris, France'),
				'Lyon',
				...POLISH_LOCATIONS,
			],
		})

		expect([...rankCountries(scored, countryEnrichment).keys()]).toEqual([
			'fr',
			'jp',
			'pl',
		])
	})

	it('uses competition ranks within a country even when global ranks differ', () => {
		const { scored, countryEnrichment } = toCountrySeason({
			locations: ['Plymouth', ...POLISH_LOCATIONS],
			merged: { 0: 50, 1: 20, 2: 20, 3: 18, 4: 18, 5: 18 },
		})
		const placements = rankCountries(scored, countryEnrichment).get('pl') ?? []

		expect(
			placements.map(({ contributor, rank }) => [
				contributor.login,
				contributor.rank,
				rank,
			])
		).toEqual([
			['user-01', 2, 1],
			['user-02', 2, 1],
			['user-03', 4, 3],
			['user-04', 4, 3],
			['user-05', 4, 3],
			['user-06', 7, 6],
			['user-07', 8, 7],
			['user-08', 9, 8],
			['user-09', 10, 9],
			['user-10', 11, 10],
		])
	})

	it('has no country without enrichment', () => {
		expect(
			rankCountries(scoreSeason(season, emptyEnrichment), emptyEnrichment).size
		).toBe(0)
	})
})

describe('buildBoards country boards', () => {
	const { scored, countrySeason, countryEnrichment } = toCountrySeason({
		locations: ['Seattle, WA', ...POLISH_LOCATIONS],
	})
	const countryBoards = buildBoards({
		season: countrySeason,
		scored,
		enrichment: countryEnrichment,
		computedAt,
	})

	it('writes a country board with its country, own ranks and season percentiles', () => {
		const [poland] = countryBoards.countries

		expect(countryBoards.countries).toHaveLength(1)
		expect(poland).toMatchObject({
			season: '2026-10',
			board: 'country',
			country: { code: 'pl', name: 'Poland', flag: '🇵🇱', contributors: 10 },
			computedAt,
			contributors: 10,
		})
		expect(
			poland?.rows.slice(0, 2).map(row => [row.rank, row.login, row.percentile])
		).toEqual([
			[1, 'user-01', scored.ranked[1]?.percentile],
			[2, 'user-02', scored.ranked[2]?.percentile],
		])
		expect(countryBoards.global).not.toHaveProperty('country')
	})

	it('keeps the country rank of every contributor on a country board', () => {
		expect(countryBoards.countryRanks.get(login('user-01'))).toEqual({
			code: 'pl',
			rank: 1,
		})
		expect(countryBoards.countryRanks.get(login('user-10'))).toEqual({
			code: 'pl',
			rank: 10,
		})
		expect(countryBoards.countryRanks.has(login('user-00'))).toBe(false)
	})
})
