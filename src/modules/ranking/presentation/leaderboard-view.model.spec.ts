import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login.schema'
import { isoDateSchema } from '@shared/schema/iso-date.schema'
import { seasonIdSchema } from '@shared/schema/season-id.schema'
import type { BoardFile } from '../domain/files/board.file'
import type { SeasonIndex } from '../domain/files/season-index.file'
import type { ShardEntry } from '../domain/files/shard.file'
import { scoreSeason } from '../domain/score-season.helper'
import { buildShards, shardKeyOf } from '../domain/shards.helper'
import { computedAt, toEnrichment, toSeason } from '../testing/season.mock'
import {
	findSeason,
	toBoardView,
	toContributorOutcome,
	toContributorView,
	toSeasonView,
} from './leaderboard-view.model'
import { toVisitorRow } from './visitor-row.helper'

const login = githubLoginSchema.make
const october = seasonIdSchema.make('2026-10')
const september = seasonIdSchema.make('2026-09')

const entry = {
	id: october,
	status: 'provisional',
	daysIncluded: 4,
	daysInMonth: 31,
	missingDays: [isoDateSchema.make('2026-10-05')],
	computedAt: '2026-10-06T06:00:00.000Z',
	contributors: 6853,
	repositories: 18_871,
	mergedPullRequests: 28_490,
} as const satisfies SeasonIndex['seasons'][number]

const index = {
	latest: october,
	seasons: [entry, { ...entry, id: september, status: 'final' }],
} as const satisfies SeasonIndex

const POLAND = {
	code: 'pl',
	name: 'Poland',
	flag: '🇵🇱',
	contributors: 1204,
} as const

const shardEntry = (fields: Partial<ShardEntry>): ShardEntry => ({
	login: login('steipete'),
	rank: 3,
	percentile: 99.9,
	score: 2677,
	mergedPullRequests: 2,
	selfMergedPullRequests: 3,
	boards: { country: null },
	repositories: [
		{
			repository: 'openclaw/openclaw',
			mergedPullRequests: 1,
			selfMergedPullRequests: 3,
			standing: 391_594,
			counted: true,
			score: 2600,
		},
		{
			repository: 'openclaw/bun',
			mergedPullRequests: 1,
			selfMergedPullRequests: 0,
			standing: 3,
			counted: false,
			score: 0,
		},
	],
	name: 'Peter Steinberger',
	location: 'London',
	excluded: null,
	...fields,
})

describe('findSeason', () => {
	it('picks the newest season when none is asked for', () => {
		expect(findSeason(index)?.id).toBe(october)
	})

	it('picks a requested season and misses an unknown one', () => {
		expect(findSeason(index, september)?.status).toBe('final')
		expect(findSeason(index, seasonIdSchema.make('2026-01'))).toBeUndefined()
	})
})

describe('toSeasonView', () => {
	it('carries the last day counted', () => {
		expect(toSeasonView(entry).lastDayIncluded).toBe('2026-10-04')
	})

	it('carries excluded bots, null for an index written before them', () => {
		expect(toSeasonView({ ...entry, excludedBots: 179 }).excludedBots).toBe(179)
		expect(toSeasonView(entry).excludedBots).toBeNull()
	})

	it('carries the countries with a board, none for an index written before them', () => {
		expect(toSeasonView({ ...entry, countries: [POLAND] }).countries).toEqual([
			POLAND,
		])
		expect(toSeasonView(entry).countries).toEqual([])
	})
})

describe('toContributorOutcome', () => {
	it('keeps counted repositories ahead of uncounted ones through scoring and mapping', () => {
		const season = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'tiny/tool', merged: 100 },
				{ author: 'alice', repository: 'large/tool', merged: 1 },
				{ author: 'alice', repository: 'medium/tool', merged: 1 },
			],
		})
		const enrichment = toEnrichment({
			repositories: {
				'large/tool': { stars: 1000, language: null },
				'medium/tool': { stars: 10, language: null },
			},
		})
		const shards = buildShards({
			seasonId: october,
			scored: scoreSeason(season, enrichment),
			countryRanks: new Map(),
			enrichment,
			computedAt,
		})
		const outcome = toContributorOutcome(
			'alice',
			shards.get(shardKeyOf('alice'))?.entries['alice']
		)
		expect(outcome).toMatchObject({
			state: 'ranked',
			contributor: {
				repositories: [
					{ repository: 'large/tool', counted: true },
					{ repository: 'medium/tool', counted: true },
					{ repository: 'tiny/tool', counted: false },
				],
			},
		})
	})

	it.each([0, 3])(
		'preserves %d self-merges separately from the total',
		selfMergedPullRequests => {
			expect(
				toContributorView(shardEntry({ selfMergedPullRequests }), [])
			).toMatchObject({
				selfMergedPullRequests,
				mergedPullRequests: 2 + selfMergedPullRequests,
				percentile: 99.9,
			})
		}
	)

	it('names the country rank from the season countries', () => {
		expect(
			toContributorView(
				shardEntry({ boards: { country: { code: 'pl', rank: 2 } } }),
				[POLAND]
			).country
		).toEqual({ code: 'pl', name: 'Poland', flag: '🇵🇱', rank: 2 })
	})

	it.each([
		['a shard written before country boards', {}],
		['no country board', { country: null }],
		['a country the index does not list', { country: { code: 'de', rank: 1 } }],
	])('has no country rank with %s', (_, boards) => {
		expect(
			toContributorOutcome('steipete', shardEntry({ boards }), [POLAND])
		).toMatchObject({ contributor: { country: null } })
	})
	it('is not found without a shard entry', () => {
		expect(toContributorOutcome('ghost', undefined)).toEqual({
			state: 'notFound',
			login: 'ghost',
		})
	})

	it('is ranked with merged pull requests summed over merge kinds', () => {
		expect(toContributorOutcome('steipete', shardEntry({}))).toMatchObject({
			state: 'ranked',
			contributor: {
				mergedPullRequests: 5,
				selfMergedPullRequests: 3,
				repositories: [
					{ repository: 'openclaw/openclaw', mergedPullRequests: 4 },
					{ repository: 'openclaw/bun', counted: false },
				],
			},
		})
	})

	it('takes its state from the exclusion', () => {
		expect(
			toContributorOutcome(
				'weblate',
				shardEntry({ rank: null, percentile: null, excluded: 'bot' })
			).state
		).toBe('bot')
		expect(
			toContributorOutcome(
				'jverkoey',
				shardEntry({
					rank: null,
					percentile: null,
					excluded: 'noCountedRepository',
				})
			).state
		).toBe('noCountedRepository')
	})
})

describe('toBoardView and toVisitorRow', () => {
	const file = {
		season: october,
		board: 'global',
		computedAt: entry.computedAt,
		contributors: 3,
		rows: ['alice', 'bob', 'carol'].map((name, position) => ({
			rank: position + 1,
			login: login(name),
			score: 300 - position,
			percentile: 90,
			mergedPullRequests: 2,
			selfMergedPullRequests: 1,
			repositories: 3,
			topRepositories: [
				{
					repository: 'acme/widgets',
					mergedPullRequests: 3,
					counted: true,
					score: 300,
				},
			],
			name: null,
			location: null,
		})),
	} as const satisfies BoardFile
	const board = toBoardView(file, 2)

	it.each([0, 1, 8])(
		'counts repositories beyond the single displayed repository: %d',
		repositories => {
			const rows = file.rows.map(row => ({
				...row,
				repositories,
				topRepositories:
					repositories === 0
						? []
						: Array.from(
								{ length: Math.min(3, repositories) },
								(_, position) => ({
									repository: `acme/tool-${position}`,
									mergedPullRequests: 1,
									counted: true,
									score: 10,
								})
							),
			}))
			expect(toBoardView({ ...file, rows }, 1).rows[0]).toMatchObject({
				topRepository: repositories === 0 ? null : 'acme/tool-0',
				otherRepositories: repositories === 0 ? 0 : repositories - 1,
			})
		}
	)

	it('carries the country of a country board, none on Global', () => {
		expect(board.country).toBeNull()
		expect(
			toBoardView(
				{ ...file, board: 'country', country: POLAND, contributors: 1204 },
				2
			)
		).toMatchObject({ id: 'country', country: POLAND, contributors: 1204 })
	})

	it('keeps the requested rows and how many there are', () => {
		expect(board.rows.map(row => row.login)).toEqual(['alice', 'bob'])
		expect(board.availableRows).toBe(3)
		expect(board.rows[0]).toMatchObject({
			mergedPullRequests: 3,
			topRepository: 'acme/widgets',
			otherRepositories: 2,
		})
	})

	it('appends a ranked visitor below the rows shown', () => {
		expect(
			toVisitorRow(toContributorOutcome('steipete', shardEntry({})), board.rows)
		).toMatchObject({
			rank: 3,
			login: 'steipete',
			topRepository: 'openclaw/openclaw',
			otherRepositories: 1,
		})
	})

	it('does not append a visitor already shown or not ranked', () => {
		expect(
			toVisitorRow(
				toContributorOutcome('alice', shardEntry({ login: login('alice') })),
				board.rows
			)
		).toBeUndefined()
		expect(
			toVisitorRow(toContributorOutcome('ghost', undefined), board.rows)
		).toBeUndefined()
	})
})
