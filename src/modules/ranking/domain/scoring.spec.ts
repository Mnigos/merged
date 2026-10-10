import { describe, expect, it } from '@effect/vitest'
import {
	ownerOf,
	POPULARITY_OFFSET,
	PR_WEIGHT,
	popularityWeight,
	repoTerm,
	SCORE_SCALE,
	scoreAuthor,
	scoreBreakdown,
	scoreOwner,
} from './scoring'

const prs = (merged: number, selfMerged = 0, ownRepo = 0) => ({
	merged,
	selfMerged,
	ownRepo,
})

const repo = (repository: string, merged: number, popularity = 0) => ({
	repository,
	popularity,
	prs: prs(merged),
})

describe('scoring', () => {
	it('gives a repository with no popularity a weight of 1', () => {
		expect(popularityWeight(0)).toBe(1)
		expect(popularityWeight(-5)).toBe(1)
	})

	it('pins the published scoring constants', () => {
		expect(PR_WEIGHT).toEqual({ merged: 1, selfMerged: 0.5, ownRepo: 0 })
		expect(POPULARITY_OFFSET).toBe(10)
		expect(SCORE_SCALE).toBe(100)
	})

	it('squares popularity before combining mixed merge kinds under an owner', () => {
		const repositories = [
			{ repository: 'acme/one', popularity: 90, prs: prs(2, 2, 50) },
			repo('acme/two', 4),
			repo('other/one', 1),
		]

		expect(
			repoTerm({ repository: 'acme/one', popularity: 90, prs: prs(2, 2, 50) })
		).toBe(12)
		expect(scoreAuthor(repositories)).toBe(5 * SCORE_SCALE)
	})

	it('awards leftover points by remainder before repository name', () => {
		expect(scoreBreakdown([repo('acme/a', 2), repo('acme/z', 1)])).toEqual({
			total: 173,
			repositories: new Map([
				['acme/a', 115],
				['acme/z', 58],
			]),
		})
	})

	it('breaks equal remainder ties by repository name regardless of input order', () => {
		const repositories = [repo('acme/z', 1), repo('acme/a', 1)]
		const expected = {
			total: 141,
			repositories: new Map([
				['acme/a', 71],
				['acme/z', 70],
			]),
		}

		expect(scoreBreakdown(repositories)).toEqual(expected)
		expect(scoreBreakdown(repositories.toReversed())).toEqual(expected)
	})

	it('reads the owner of a repository', () => {
		expect(ownerOf('acme/widgets')).toBe('acme')
	})

	it('weights self-merges at half and own-repo PRs at zero', () => {
		const popularity = 100 - POPULARITY_OFFSET

		expect(
			repoTerm({ repository: 'a/b', popularity, prs: prs(1) })
		).toBeCloseTo(4)
		expect(
			repoTerm({ repository: 'a/b', popularity, prs: prs(0, 2) })
		).toBeCloseTo(4 * 2 * PR_WEIGHT.selfMerged)
		expect(repoTerm({ repository: 'a/b', popularity, prs: prs(0, 0, 5) })).toBe(
			0
		)
	})

	it('scores one merged PR into an unknown repository at SCORE_SCALE', () => {
		expect(scoreAuthor([repo('a/b', 1)])).toBe(SCORE_SCALE)
	})

	it('scores one merged PR into a 100k-star repository about five times higher', () => {
		expect(
			scoreAuthor([repo('big/project', 1, 100_000 - POPULARITY_OFFSET)])
		).toBe(5 * SCORE_SCALE)
	})

	it('scores a single repository as sqrt(PRs) × log10(standing + 10)', () => {
		expect(scoreAuthor([repo('a/b', 9, 990)])).toBe(
			Math.round(SCORE_SCALE * 3 * 3)
		)
		expect(scoreAuthor([repo('a/b', 100)])).toBe(10 * SCORE_SCALE)
	})

	it('shares one square root between repositories of the same owner', () => {
		const sameOwner = scoreAuthor([repo('acme/one', 1), repo('acme/two', 1)])
		const twoOwners = scoreAuthor([repo('acme/one', 1), repo('other/two', 1)])

		expect(sameOwner).toBe(Math.round(SCORE_SCALE * Math.SQRT2))
		expect(twoOwners).toBe(2 * SCORE_SCALE)
		expect(scoreOwner([repo('acme/one', 1), repo('acme/two', 1)])).toBeCloseTo(
			Math.SQRT2
		)
	})

	it('gives a farm of 207 tiny repositories under one owner sqrt(207), not 207', () => {
		const farm = Array.from({ length: 207 }, (_, index) =>
			repo(`farm/repo-${index}`, 1)
		)

		expect(scoreAuthor(farm)).toBe(Math.round(Math.sqrt(207) * SCORE_SCALE))
	})

	it('splits the score into integer repository shares that sum to the total', () => {
		const repos = [
			repo('acme/one', 3, 40),
			repo('acme/two', 1),
			repo('other/x', 2, 5),
			repo('third/y', 1, 1),
			repo('third/z', 1, 7),
		]
		const breakdown = scoreBreakdown(repos)

		expect(
			[...breakdown.repositories.values()].reduce(
				(total, share) => total + share,
				0
			)
		).toBe(breakdown.total)
		expect(breakdown.total).toBe(scoreAuthor(repos))
		expect([...breakdown.repositories.values()].every(Number.isInteger)).toBe(
			true
		)
		expect(breakdown.repositories.get('other/x')).toBe(
			Math.round(SCORE_SCALE * Math.sqrt(2) * popularityWeight(5))
		)
	})

	it('gives an own-repo-only repository a share of 0', () => {
		expect(
			scoreBreakdown([
				repo('acme/one', 1),
				{ repository: 'acme/two', popularity: 0, prs: prs(0, 0, 4) },
			]).repositories.get('acme/two')
		).toBe(0)
	})

	it('scores an author without repositories as 0', () => {
		expect(scoreBreakdown([])).toEqual({ total: 0, repositories: new Map() })
	})
})
