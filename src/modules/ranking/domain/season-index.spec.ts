import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { daysInSeason, seasonIdSchema } from '@shared/schema/season-id'
import { seasonId, toSeason } from '../testing/season.mock'
import { emptyEnrichment } from './enrichment'
import type { SeasonIndexEntry } from './files/season-index-file'
import { scoreSeason } from './score-season'
import {
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
		})
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
