import { describe, expect, it } from '@effect/vitest'
import { login, toEnrichment, toSeason } from '../testing/season.mock'
import { emptyEnrichment } from './enrichment'
import { scoreSeason } from './score-season'
import { popularityWeight, SCORE_SCALE, scoreBreakdown } from './scoring'

interface RepoInput {
	readonly repository: string
	readonly popularity: number
	readonly merged: number
	readonly selfMerged?: number
}

const breakdownOf = (...repos: readonly RepoInput[]) =>
	scoreBreakdown(
		repos.map(({ repository, popularity, merged, selfMerged = 0 }) => ({
			repository,
			popularity,
			prs: { merged, selfMerged, ownRepo: 0 },
		}))
	)

describe('scoreSeason', () => {
	const season = toSeason({
		date: '2026-10-01',
		rows: [
			{
				author: 'alice',
				repository: 'acme/widgets',
				pullRequests: [1, 2, 3, 4],
			},
			{ author: 'alice', repository: 'tiny/tool', pullRequests: [7] },
			{ author: 'bob', repository: 'acme/widgets', pullRequests: [5] },
			{ author: 'carol', repository: 'tiny/tool', pullRequests: [8] },
		],
		stars: { 'acme/widgets': 98 },
	})

	it('scores with standing as popularity and splits the score per repository', () => {
		const [alice] = scoreSeason(season, emptyEnrichment).ranked
		const expected = breakdownOf(
			{ repository: 'acme/widgets', popularity: 100, merged: 4 },
			{ repository: 'tiny/tool', popularity: 2, merged: 1 }
		)

		expect(alice).toMatchObject({
			login: 'alice',
			merged: 5,
			selfMerged: 0,
			repositories: [
				{
					repository: 'acme/widgets',
					merged: 4,
					selfMerged: 0,
					standing: 100,
					score: expected.repositories.get('acme/widgets'),
					pullRequests: [1, 2, 3, 4],
				},
				{
					repository: 'tiny/tool',
					merged: 1,
					standing: 2,
					score: expected.repositories.get('tiny/tool'),
				},
			],
		})
		expect(alice?.score).toBe(expected.total)
		expect(alice?.score).toBe(
			(alice?.repositories ?? []).reduce(
				(total, repository) => total + repository.score,
				0
			)
		)
	})

	it('turns merged PRs whose merger is the author into self-merges', () => {
		const [alice] = scoreSeason(
			season,
			toEnrichment({
				mergers: {
					'acme/widgets#1': 'alice',
					'acme/widgets#2': 'alice',
					'acme/widgets#3': 'dave',
				},
			})
		).ranked

		expect(alice?.repositories[0]).toMatchObject({
			repository: 'acme/widgets',
			merged: 2,
			selfMerged: 2,
			score: breakdownOf(
				{
					repository: 'acme/widgets',
					popularity: 100,
					merged: 2,
					selfMerged: 2,
				},
				{ repository: 'tiny/tool', popularity: 2, merged: 1 }
			).repositories.get('acme/widgets'),
		})
		expect(alice).toMatchObject({ merged: 3, selfMerged: 2 })
	})

	it('resolves a mixed-case merger as the author', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					{ author: 'Alice', repository: 'Acme/Widgets', pullRequests: [1] },
				],
				stars: { 'acme/widgets': 3 },
			}),
			toEnrichment({ mergers: { 'acme/widgets#1': 'ALIce' } })
		)

		expect(scored.ranked[0]).toMatchObject({
			login: 'alice',
			merged: 0,
			selfMerged: 1,
		})
	})

	it('uses real stars from enrichment as standing', () => {
		const [alice] = scoreSeason(
			season,
			toEnrichment({
				repositories: { 'tiny/tool': { stars: 99_998, language: 'Rust' } },
			})
		).ranked

		expect(alice?.repositories[0]).toMatchObject({
			repository: 'tiny/tool',
			standing: 100_000,
		})
	})

	it('excludes bots flagged by enrichment but keeps them for lookup', () => {
		const scored = scoreSeason(
			season,
			toEnrichment({ contributors: { bob: { isBot: true } } })
		)

		expect(scored.ranked.map(contributor => contributor.login)).toEqual([
			'alice',
			'carol',
		])
		expect(scored.excluded).toMatchObject([
			{ login: 'bob', exclusion: 'bot', merged: 1 },
		])
	})

	it('excludes logins matching the bot rules without enrichment', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					{ author: 'alice', repository: 'a/b', pullRequests: [1] },
					{ author: 'copilot', repository: 'a/b', pullRequests: [2] },
					{ author: 'acme-release-bot', repository: 'a/b', pullRequests: [3] },
				],
				stars: { 'a/b': 3 },
			}),
			emptyEnrichment
		)

		expect(scored.ranked.map(contributor => contributor.login)).toEqual([
			'alice',
		])
		expect(scored.excluded).toMatchObject([
			{ login: 'acme-release-bot', exclusion: 'bot' },
			{ login: 'copilot', exclusion: 'bot' },
		])
	})

	it('does not let a bot make an unstarred repository count', () => {
		const quiet = toSeason({
			date: '2026-10-01',
			rows: [
				{ author: 'alice', repository: 'quiet/lib', pullRequests: [1] },
				{ author: 'release-bot', repository: 'quiet/lib', pullRequests: [2] },
			],
		})
		const scored = scoreSeason(quiet, emptyEnrichment)

		expect(quiet.repositories.get('quiet/lib')?.contributors).toBe(1)
		expect(scored.ranked).toEqual([])
		expect(scored.excluded).toMatchObject([
			{
				login: 'alice',
				exclusion: 'noCountedRepository',
				repositories: [{ repository: 'quiet/lib', counted: false, score: 0 }],
			},
			{ login: 'release-bot', exclusion: 'bot' },
		])
	})

	it('scores 16 repositories of one owner like 4 repositories of 4 owners', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					...Array.from({ length: 16 }, (_, index) => ({
						author: 'farmer',
						repository: `farm/repo-${index}`,
						pullRequests: [1],
					})),
					...Array.from({ length: 4 }, (_, index) => ({
						author: 'spread',
						repository: `owner-${index}/repo`,
						pullRequests: [1],
					})),
				],
				stars: Object.fromEntries(
					[
						...Array.from({ length: 16 }, (_, index) => `farm/repo-${index}`),
						...Array.from({ length: 4 }, (_, index) => `owner-${index}/repo`),
					].map(repository => [repository, 3] as const)
				),
			}),
			emptyEnrichment
		)

		const fourUnitRepositories = Math.round(
			4 * SCORE_SCALE * popularityWeight(4)
		)

		expect(
			scored.ranked.map(({ login: name, score, rank }) => ({
				name,
				score,
				rank,
			}))
		).toEqual([
			{ name: 'farmer', score: fourUnitRepositories, rank: 1 },
			{ name: 'spread', score: fourUnitRepositories, rank: 1 },
		])
	})

	it('scores only repositories someone besides the author cares about', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					{ author: 'alice', repository: 'shared/lib', pullRequests: [1] },
					{ author: 'bob', repository: 'shared/lib', pullRequests: [2] },
					{ author: 'alice', repository: 'starred/app', pullRequests: [3] },
					{
						author: 'alice',
						repository: 'alice-org/solo',
						pullRequests: [4, 5],
					},
					{ author: 'carol', repository: 'carol-org/solo', pullRequests: [6] },
				],
				stars: { 'starred/app': 3, 'carol-org/solo': 2 },
			}),
			emptyEnrichment
		)
		const [alice] = scored.ranked

		expect(
			alice?.repositories.map(({ repository, counted }) => [
				repository,
				counted,
			])
		).toEqual([
			['starred/app', true],
			['shared/lib', true],
			['alice-org/solo', false],
		])
		expect(alice?.repositories.at(-1)?.score).toBe(0)
		expect(alice?.score).toBe(
			breakdownOf(
				{ repository: 'shared/lib', popularity: 2, merged: 1 },
				{ repository: 'starred/app', popularity: 4, merged: 1 }
			).total
		)
		expect(scored.excluded).toMatchObject([
			{ login: 'carol', exclusion: 'noCountedRepository', score: 0 },
		])
		expect(scored.ranked.map(contributor => contributor.login)).toEqual([
			'alice',
			'bob',
		])
	})

	it('counts a lone repository once enrichment reports enough real stars', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					{ author: 'carol', repository: 'carol-org/solo', pullRequests: [6] },
				],
			}),
			toEnrichment({
				repositories: { 'carol-org/solo': { stars: 10, language: null } },
			})
		)

		expect(scored.ranked).toMatchObject([
			{ login: 'carol', repositories: [{ counted: true }] },
		])
	})

	it('drops contributors with a score of 0', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					{ author: 'alice', repository: 'a/b', pullRequests: [1] },
					{ author: 'ghost', repository: 'a/b', merged: 0, selfMerged: 0 },
				],
				stars: { 'a/b': 3 },
			}),
			emptyEnrichment
		)

		expect(scored.ranked.map(contributor => contributor.login)).toEqual([
			'alice',
		])
	})

	it('orders by score then login, ties share a rank and a percentile', () => {
		const scored = scoreSeason(
			toSeason({
				date: '2026-10-01',
				rows: [
					{ author: 'zed', repository: 'z/one', pullRequests: [1] },
					{ author: 'amy', repository: 'a/one', pullRequests: [1] },
					{ author: 'top', repository: 't/one', pullRequests: [1, 2, 3, 4] },
					{ author: 'low', repository: 'l/one', merged: 0, selfMerged: 1 },
				],
				stars: { 'z/one': 3, 'a/one': 3, 't/one': 3, 'l/one': 3 },
			}),
			emptyEnrichment
		)

		expect(
			scored.ranked.map(({ login: name, rank, percentile }) => ({
				name,
				rank,
				percentile,
			}))
		).toEqual([
			{ name: 'top', rank: 1, percentile: 75 },
			{ name: 'amy', rank: 2, percentile: 25 },
			{ name: 'zed', rank: 2, percentile: 25 },
			{ name: 'low', rank: 4, percentile: 0 },
		])
	})

	it('scores an empty season as empty', () => {
		expect(scoreSeason(toSeason(), emptyEnrichment)).toEqual({
			ranked: [],
			excluded: [],
		})
	})

	it('keeps contributor logins as the season keys', () => {
		expect(
			scoreSeason(season, emptyEnrichment).ranked.map(
				contributor => contributor.login
			)
		).toContain(login('carol'))
	})
})
