import { describe, expect, it } from '@effect/vitest'
import {
	login,
	seasonId,
	toDay,
	toEnrichment,
	toSeason,
} from '../testing/season.mock'
import { emptyEnrichment } from './enrichment'
import { scoreSeason } from './score-season'
import {
	addDay,
	assembleSeason,
	createSeasonAccumulator,
	finishSeason,
} from './season'

describe('assembleSeason', () => {
	const season = toSeason(
		{
			date: '2026-10-02',
			rows: [
				{ author: 'alice', repository: 'acme/widgets', pullRequests: [5, 2] },
				{ author: 'bob', repository: 'acme/widgets', merged: 0, selfMerged: 1 },
			],
			stars: { 'acme/widgets': 3, 'lonely/repo': 4 },
			ownRepo: { alice: 2 },
		},
		{
			date: '2026-10-01',
			rows: [
				{ author: 'Alice', repository: 'Acme/Widgets', pullRequests: [9] },
				{ author: 'alice', repository: 'other/tool', pullRequests: [1] },
				{ author: 'carol', repository: 'acme/widgets', pullRequests: [3] },
			],
			stars: { 'acme/widgets': 2 },
		}
	)

	it('sums each contributor per lowercase repository and keeps sorted PR numbers', () => {
		expect(season.contributors.get(login('alice'))).toEqual({
			login: 'alice',
			repositories: new Map([
				[
					'acme/widgets',
					{ merged: 3, selfMerged: 0, mergedPullRequests: [2, 5, 9] },
				],
				['other/tool', { merged: 1, selfMerged: 0, mergedPullRequests: [1] }],
			]),
		})
		expect(
			season.contributors.get(login('bob'))?.repositories.get('acme/widgets')
		).toEqual({ merged: 0, selfMerged: 1, mergedPullRequests: [] })
	})

	it('counts distinct contributors across the season, not per day', () => {
		expect(season.repositories.get('acme/widgets')).toEqual({
			repository: 'acme/widgets',
			contributors: 3,
			starsInSeason: 5,
			mergedPullRequests: 5,
		})
	})

	it('keeps only repositories with merged pull requests', () => {
		expect(season.repositories.has('lonely/repo')).toBe(false)
		expect([...season.repositories.keys()].toSorted()).toEqual([
			'acme/widgets',
			'other/tool',
		])
	})

	it('sums totals and lists the included days in order', () => {
		expect(season.totals).toEqual({
			merged: 5,
			selfMerged: 1,
			ownRepo: 2,
			stars: 9,
		})
		expect(season.daysIncluded).toEqual(['2026-10-01', '2026-10-02'])
		expect(season.seasonId).toBe('2026-10')
	})

	it('counts a pull request seen on two days once', () => {
		const repeated = toSeason(
			{
				date: '2026-10-01',
				rows: [
					{ author: 'alice', repository: 'a/b', pullRequests: [1, 2] },
					{ author: 'bob', repository: 'a/b', pullRequests: [3] },
				],
			},
			{
				date: '2026-10-02',
				rows: [
					{ author: 'alice', repository: 'a/b', pullRequests: [1] },
					{ author: 'Alice', repository: 'A/B', pullRequests: [2, 4] },
				],
			}
		)
		const once = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'a/b', pullRequests: [1, 2, 4] },
				{ author: 'bob', repository: 'a/b', pullRequests: [3] },
			],
		})

		expect(
			repeated.contributors.get(login('alice'))?.repositories.get('a/b')
		).toEqual({ merged: 3, selfMerged: 0, mergedPullRequests: [1, 2, 4] })
		expect(repeated.repositories.get('a/b')).toMatchObject({
			contributors: 2,
			mergedPullRequests: 4,
		})
		expect(repeated.totals).toMatchObject({ merged: 4, selfMerged: 0 })
		expect(scoreSeason(repeated, emptyEnrichment)).toEqual(
			scoreSeason(once, emptyEnrichment)
		)
	})

	it('keeps bots apart from contributors, repositories and totals', () => {
		const withBot = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'a/b', pullRequests: [1] },
				{ author: 'renovate-bot', repository: 'a/b', pullRequests: [2, 3] },
			],
		})

		expect([...withBot.contributors.keys()]).toEqual(['alice'])
		expect(
			withBot.bots.get(login('renovate-bot'))?.repositories.get('a/b')
		).toEqual({ merged: 2, selfMerged: 0, mergedPullRequests: [2, 3] })
		expect(withBot.repositories.get('a/b')).toMatchObject({
			contributors: 1,
			mergedPullRequests: 1,
		})
		expect(withBot.totals.merged).toBe(1)
	})

	it('keeps logins flagged by the bot predicate apart, so they do not make a lone repository count', () => {
		const days = [
			toDay({
				date: '2026-10-01',
				rows: [
					{ author: 'alice', repository: 'solo/tool', pullRequests: [1] },
					{ author: 'robo', repository: 'solo/tool', pullRequests: [2] },
				],
			}),
		]
		const enrichment = toEnrichment({ contributors: { robo: { isBot: true } } })
		const flagged = assembleSeason({
			seasonId,
			days,
			isBotLogin: author => enrichment.contributors.get(author)?.isBot === true,
		})

		expect([...flagged.contributors.keys()]).toEqual(['alice'])
		expect([...flagged.bots.keys()]).toEqual(['robo'])
		expect(flagged.repositories.get('solo/tool')).toMatchObject({
			contributors: 1,
			mergedPullRequests: 1,
		})
		expect(flagged.totals.merged).toBe(1)
		expect(scoreSeason(flagged, enrichment).excluded).toMatchObject([
			{ login: 'alice', exclusion: 'noCountedRepository' },
			{ login: 'robo', exclusion: 'bot' },
		])
		expect(
			scoreSeason(assembleSeason({ seasonId, days }), enrichment).ranked.map(
				contributor => contributor.login
			)
		).toEqual(['alice'])
	})

	it('drops rows of excluded repositories from contributors and totals', () => {
		const withExcluded = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'a/b', pullRequests: [1] },
				{ author: 'alice', repository: 'Merge-Demo/queue', pullRequests: [2] },
				{ author: 'phil', repository: 'merge-demo/queue', pullRequests: [3] },
			],
		})

		expect([...withExcluded.contributors.keys()]).toEqual(['alice'])
		expect([
			...(withExcluded.contributors.get(login('alice'))?.repositories.keys() ??
				[]),
		]).toEqual(['a/b'])
		expect(withExcluded.repositories.has('merge-demo/queue')).toBe(false)
		expect(withExcluded.totals.merged).toBe(1)
	})

	it('assembles an empty season without days', () => {
		const empty = toSeason()

		expect(empty.contributors.size).toBe(0)
		expect(empty.repositories.size).toBe(0)
		expect(empty.daysIncluded).toEqual([])
	})

	it('folds days one at a time into the same season as assembling them together', () => {
		const days = [
			toDay({
				date: '2026-10-01',
				rows: [
					{ author: 'Alice', repository: 'Acme/Widgets', pullRequests: [9] },
					{
						author: 'robo[bot]',
						repository: 'acme/widgets',
						pullRequests: [4],
					},
				],
				stars: { 'acme/widgets': 2 },
			}),
			toDay({
				date: '2026-10-02',
				rows: [
					{ author: 'alice', repository: 'acme/widgets', pullRequests: [9, 5] },
					{
						author: 'bob',
						repository: 'acme/widgets',
						merged: 0,
						selfMerged: 1,
					},
				],
				stars: { 'acme/widgets': 3 },
				ownRepo: { alice: 2 },
			}),
		]
		const accumulator = createSeasonAccumulator({ seasonId })
		for (const day of days) addDay(accumulator, day)

		expect(finishSeason(accumulator)).toEqual(
			assembleSeason({ seasonId, days })
		)
		expect(finishSeason(accumulator)).toMatchObject({
			daysIncluded: ['2026-10-01', '2026-10-02'],
			totals: { merged: 2, selfMerged: 1, ownRepo: 2, stars: 5 },
		})
	})
})
