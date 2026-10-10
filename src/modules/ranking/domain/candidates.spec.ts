import { describe, expect, it } from '@effect/vitest'
import { toSeason } from '../testing/season.mock'
import { MAX_CANDIDATE_REPOSITORIES, selectCandidates } from './candidates'
import { emptyEnrichment } from './enrichment'
import { scoreSeason } from './score-season'

describe('selectCandidates', () => {
	const season = toSeason({
		date: '2026-10-01',
		rows: [
			{ author: 'alice', repository: 'zeta/app', pullRequests: [9, 3] },
			{
				author: 'alice',
				repository: 'acme/widgets',
				pullRequests: [1, 2, 4, 5],
			},
			{ author: 'bob', repository: 'acme/widgets', pullRequests: [7] },
			{ author: 'bob', repository: 'bob-org/x', merged: 0, selfMerged: 2 },
			{ author: 'carol', repository: 'carol-only/x', pullRequests: [1] },
			{ author: 'dave', repository: 'merge-demo/queue', pullRequests: [8] },
		],
		stars: { 'carol-only/x': 0 },
	})
	const scored = scoreSeason(season, emptyEnrichment)
	it('takes the top contributors with their merged PRs and their repositories, most merged PRs first', () => {
		expect(selectCandidates({ season, scored }, { contributors: 2 })).toEqual({
			contributors: ['alice', 'bob'],
			repositories: ['acme/widgets', 'bob-org/x', 'zeta/app'],
			pullRequests: [
				{ repository: 'acme/widgets', number: 1, author: 'alice' },
				{ repository: 'acme/widgets', number: 2, author: 'alice' },
				{ repository: 'acme/widgets', number: 4, author: 'alice' },
				{ repository: 'acme/widgets', number: 5, author: 'alice' },
				{ repository: 'acme/widgets', number: 7, author: 'bob' },
				{ repository: 'zeta/app', number: 3, author: 'alice' },
				{ repository: 'zeta/app', number: 9, author: 'alice' },
			],
		})
	})

	it('limits contributors, their PRs and their repositories', () => {
		expect(selectCandidates({ season, scored }, { contributors: 1 })).toEqual({
			contributors: ['alice'],
			repositories: ['acme/widgets', 'zeta/app'],
			pullRequests: [
				{ repository: 'acme/widgets', number: 1, author: 'alice' },
				{ repository: 'acme/widgets', number: 2, author: 'alice' },
				{ repository: 'acme/widgets', number: 4, author: 'alice' },
				{ repository: 'acme/widgets', number: 5, author: 'alice' },
				{ repository: 'zeta/app', number: 3, author: 'alice' },
				{ repository: 'zeta/app', number: 9, author: 'alice' },
			],
		})
		expect(selectCandidates({ season, scored }, { contributors: 0 })).toEqual({
			contributors: [],
			repositories: [],
			pullRequests: [],
		})
	})

	it('leaves out repositories of contributors outside the candidates', () => {
		expect(
			selectCandidates({ season, scored }, { contributors: 100 }).repositories
		).not.toContain('carol-only/x')
	})

	it('caps repositories, keeping the ones with the most merged PRs', () => {
		expect(
			selectCandidates({ season, scored }, { contributors: 2, repositories: 2 })
				.repositories
		).toEqual(['acme/widgets', 'bob-org/x'])
	})

	it('caps repositories at MAX_CANDIDATE_REPOSITORIES by default', () => {
		const rows = Array.from(
			{ length: MAX_CANDIDATE_REPOSITORIES + 1 },
			(_, index) => ({
				author: 'alice',
				repository: `org-${index}/repo`,
				pullRequests: index === MAX_CANDIDATE_REPOSITORIES ? [1, 2] : [1],
			})
		)
		const bigSeason = toSeason({
			date: '2026-10-01',
			rows,
			stars: Object.fromEntries(rows.map(row => [row.repository, 3])),
		})
		const { repositories } = selectCandidates(
			{ season: bigSeason, scored: scoreSeason(bigSeason, emptyEnrichment) },
			{ contributors: 1 }
		)

		expect(repositories).toHaveLength(MAX_CANDIDATE_REPOSITORIES)
		expect(repositories[0]).toBe(`org-${MAX_CANDIDATE_REPOSITORIES}/repo`)
	})

	it('never lists an excluded repository', () => {
		expect(
			selectCandidates({ season, scored }, { contributors: 100 }).repositories
		).not.toContain('merge-demo/queue')
	})

	it('does not let a higher-scoring bot consume a candidate slot', () => {
		const withBotSeason = toSeason({
			date: '2026-10-01',
			rows: [
				{
					author: 'release-bot',
					repository: 'bot-org/project',
					pullRequests: [1, 2, 3, 4],
				},
				{
					author: 'alice',
					repository: 'human-org/project',
					pullRequests: [5],
				},
			],
			stars: { 'bot-org/project': 3, 'human-org/project': 3 },
		})

		expect(
			selectCandidates(
				{
					season: withBotSeason,
					scored: scoreSeason(withBotSeason, emptyEnrichment),
				},
				{ contributors: 1 }
			)
		).toEqual({
			contributors: ['alice'],
			repositories: ['human-org/project'],
			pullRequests: [
				{ repository: 'human-org/project', number: 5, author: 'alice' },
			],
		})
	})

	it('takes every ranked contributor when the limit exceeds the season', () => {
		expect(
			selectCandidates({ season, scored }, { contributors: 100 }).contributors
		).toEqual(['alice', 'bob'])
	})
})
