import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { daysInSeason, seasonIdSchema } from '@shared/schema/season-id'
import { Result, Schema } from 'effect'
import { seasonId, toSeason } from '../testing/season.mock'
import { emptyEnrichment } from './enrichment'
import type { SeasonIndexEntry } from './files/season-index-file'
import { seasonIndexEntrySchema } from './files/season-index-file'
import { scoreSeason } from './score-season'
import {
	lastDayIncluded,
	missingDays,
	seasonStatus,
	toSeasonIndexEntry,
	upsertSeasonIndex,
} from './season-index'

const allDays = daysInSeason(seasonId)
const day = isoDateSchema.make

describe('seasonStatus', () => {
	it('is final when every day is included and the month is over', () => {
		expect(
			seasonStatus({
				seasonId,
				daysIncluded: allDays,
				now: new Date('2026-11-01T06:00:00Z'),
			})
		).toBe('final')
	})

	it('is provisional while the month is running, even with every day', () => {
		expect(
			seasonStatus({
				seasonId,
				daysIncluded: allDays,
				now: new Date('2026-10-31T23:59:59Z'),
			})
		).toBe('provisional')
	})

	it('is provisional after the month when a day is missing', () => {
		expect(
			seasonStatus({
				seasonId,
				daysIncluded: allDays.slice(1),
				now: new Date('2026-12-01T00:00:00Z'),
			})
		).toBe('provisional')
	})
})

describe('missingDays', () => {
	it('lists days already over without an aggregate, not today or later', () => {
		expect(
			missingDays({
				seasonId,
				daysIncluded: [day('2026-10-01'), day('2026-10-03')],
				now: new Date('2026-10-05T06:00:00Z'),
			})
		).toEqual(['2026-10-02', '2026-10-04'])
	})

	it('lists every absent day of a past season', () => {
		expect(
			missingDays({
				seasonId,
				daysIncluded: allDays.filter(date => date !== '2026-10-31'),
				now: new Date('2027-01-01T00:00:00Z'),
			})
		).toEqual(['2026-10-31'])
	})
})

const entryFor = (id: string) =>
	({
		id: seasonIdSchema.make(id),
		status: 'final',
		daysIncluded: 30,
		daysInMonth: 30,
		missingDays: [],
		computedAt: '2026-10-01T06:00:00.000Z',
		contributors: 1,
		repositories: 1,
		mergedPullRequests: 1,
	}) satisfies SeasonIndexEntry

describe('toSeasonIndexEntry', () => {
	it('describes the computed season', () => {
		const season = toSeason(
			{
				date: '2026-10-01',
				rows: [
					{ author: 'alice', repository: 'a/b', pullRequests: [1, 2] },
					{ author: 'bob', repository: 'a/b', merged: 0, selfMerged: 1 },
				],
				ownRepo: { alice: 4 },
			},
			{ date: '2026-10-03' }
		)

		expect(
			toSeasonIndexEntry({
				season,
				scored: scoreSeason(season, emptyEnrichment),
				now: new Date('2026-10-04T06:00:00Z'),
			})
		).toEqual({
			id: '2026-10',
			status: 'provisional',
			daysIncluded: 2,
			daysInMonth: 31,
			missingDays: ['2026-10-02'],
			computedAt: '2026-10-04T06:00:00.000Z',
			contributors: 2,
			repositories: 1,
			mergedPullRequests: 3,
			excludedBots: 0,
		})
	})

	it('counts the logins excluded as bots', () => {
		const season = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'a/b', pullRequests: [1] },
				{ author: 'bob', repository: 'a/b', pullRequests: [2] },
				{ author: 'release-bot', repository: 'a/b', pullRequests: [3] },
				{ author: 'weblate', repository: 'c/d', pullRequests: [4] },
			],
		})

		expect(
			toSeasonIndexEntry({
				season,
				scored: scoreSeason(season, emptyEnrichment),
				now: new Date('2026-10-04T06:00:00Z'),
			}).excludedBots
		).toBe(2)
	})
})

describe('upsertSeasonIndex', () => {
	it('starts an index and points latest at the season', () => {
		expect(upsertSeasonIndex(undefined, entryFor('2026-10'))).toEqual({
			latest: '2026-10',
			seasons: [entryFor('2026-10')],
		})
	})

	it('replaces the same season, keeps others, orders newest first', () => {
		const updated = { ...entryFor('2026-09'), contributors: 99 }

		expect(
			upsertSeasonIndex(
				{
					latest: seasonIdSchema.make('2026-10'),
					seasons: [
						entryFor('2026-10'),
						entryFor('2026-09'),
						entryFor('2025-12'),
					],
				},
				updated
			)
		).toEqual({
			latest: '2026-10',
			seasons: [entryFor('2026-10'), updated, entryFor('2025-12')],
		})
	})
})

describe('lastDayIncluded', () => {
	const entry = {
		id: seasonId,
		status: 'provisional',
		daysIncluded: 4,
		daysInMonth: 31,
		missingDays: [5, 6, 7, 8, 9].map(index => day(`2026-10-0${index}`)),
		computedAt: '2026-10-10T16:14:26.969Z',
		contributors: 10,
		repositories: 5,
		mergedPullRequests: 20,
	} as const satisfies SeasonIndexEntry

	it('is the latest day before the recompute that is not missing', () => {
		expect(lastDayIncluded(entry)).toBe('2026-10-04')
	})

	it('is the day before the recompute when nothing is missing', () => {
		expect(
			lastDayIncluded({
				...entry,
				daysIncluded: 9,
				missingDays: [],
			})
		).toBe('2026-10-09')
	})

	it('is the last day of the month for a final season', () => {
		expect(
			lastDayIncluded({
				...entry,
				status: 'final',
				daysIncluded: 31,
				missingDays: [],
				computedAt: '2026-11-01T06:00:00.000Z',
			})
		).toBe('2026-10-31')
	})

	it('is undefined before any day is included', () => {
		expect(
			lastDayIncluded({ ...entry, daysIncluded: 0, missingDays: [] })
		).toBeUndefined()
	})

	it('skips gaps rather than treating the included count as a day number', () => {
		expect(
			lastDayIncluded({
				...entry,
				daysIncluded: 2,
				missingDays: [day('2026-10-01'), day('2026-10-03')],
				computedAt: '2026-10-05T00:00:00.000Z',
			})
		).toBe('2026-10-04')
	})
})

describe('seasonIndexEntrySchema excludedBots', () => {
	const decode = Schema.decodeUnknownResult(seasonIndexEntrySchema)

	it('decodes an older index without a bot count', () => {
		expect(
			Result.getOrThrow(decode(entryFor('2026-09'))).excludedBots
		).toBeUndefined()
	})

	it.each([0, 179])('preserves bot count %d', excludedBots => {
		expect(
			Result.getOrThrow(decode({ ...entryFor('2026-09'), excludedBots }))
				.excludedBots
		).toBe(excludedBots)
	})

	it.each([-1, 1.5, '2', null])(
		'rejects invalid bot count %j',
		excludedBots => {
			expect(
				Result.isFailure(decode({ ...entryFor('2026-09'), excludedBots }))
			).toBe(true)
		}
	)
})
