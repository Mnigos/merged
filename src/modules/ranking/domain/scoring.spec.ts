import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
	CAP_PER_REPO,
	capScore,
	isBot,
	popularityWeight,
	scoreAuthor,
	scoreRepo,
} from './scoring'

const prs = (merged: number, selfMerged = 0, ownRepo = 0) => ({
	merged,
	selfMerged,
	ownRepo,
})

describe('scoring', () => {
	it('caps a single repository at 30% of the uncapped total', () => {
		expect(capScore([100, 10, 10])).toBeCloseTo(36 + 10 + 10)
		expect(capScore([50])).toBeCloseTo(50 * CAP_PER_REPO)
	})

	it('weights self-merges at half and own-repo PRs at zero', () => {
		const popularity = 90

		expect(scoreRepo({ popularity, prs: prs(1) })).toBeCloseTo(2)
		expect(scoreRepo({ popularity, prs: prs(0, 1) })).toBeCloseTo(1)
		expect(scoreRepo({ popularity, prs: prs(0, 0, 5) })).toBe(0)
	})

	it('gives a repository with no popularity a weight of 1', () => {
		expect(popularityWeight(0)).toBe(1)
	})

	it('detects bots by suffix and by known login', () => {
		expect(isBot('dependabot[bot]')).toBe(true)
		expect(isBot('Renovate')).toBe(true)
		expect(isBot('Mnigos')).toBe(false)
	})

	it.effect('runs inside an Effect', () =>
		Effect.gen(function* () {
			const score = yield* Effect.sync(() =>
				scoreAuthor([
					{ popularity: 0, prs: prs(10) },
					{ popularity: 0, prs: prs(10) },
					{ popularity: 0, prs: prs(10) },
					{ popularity: 0, prs: prs(10) },
				])
			)

			expect(score).toBeCloseTo(40)
		})
	)
})
