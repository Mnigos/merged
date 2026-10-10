import { describe, expect, it } from '@effect/vitest'
import {
	MIN_OTHER_CONTRIBUTORS,
	MIN_REAL_STARS,
	MIN_STARS_IN_SEASON,
	repositoryCounts,
} from './counts'

describe('repositoryCounts', () => {
	it('pins the published thresholds', () => {
		expect(MIN_OTHER_CONTRIBUTORS).toBe(1)
		expect(MIN_STARS_IN_SEASON).toBe(3)
		expect(MIN_REAL_STARS).toBe(10)
	})

	it('does not count a repository only the author touched', () => {
		expect(
			repositoryCounts({ contributors: 1, starsInSeason: 0, stars: undefined })
		).toBe(false)
		expect(
			repositoryCounts({
				contributors: 1,
				starsInSeason: MIN_STARS_IN_SEASON - 1,
				stars: MIN_REAL_STARS - 1,
			})
		).toBe(false)
	})

	it('counts a repository another outside contributor merged into', () => {
		expect(
			repositoryCounts({ contributors: 2, starsInSeason: 0, stars: undefined })
		).toBe(true)
	})

	it('counts a repository starred in the season', () => {
		expect(
			repositoryCounts({
				contributors: 1,
				starsInSeason: MIN_STARS_IN_SEASON,
				stars: undefined,
			})
		).toBe(true)
	})

	it('counts a repository with enough real stars', () => {
		expect(
			repositoryCounts({
				contributors: 1,
				starsInSeason: 0,
				stars: MIN_REAL_STARS,
			})
		).toBe(true)
	})
})
