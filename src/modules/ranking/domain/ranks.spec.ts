import { describe, expect, it } from '@effect/vitest'
import { toCompetitionRanks, toPercentiles, topShareOf } from './ranks'

const sameNumber = (previous: number, current: number) => previous === current

describe('toCompetitionRanks', () => {
	it('shares a rank between ties and skips the next places', () => {
		expect(toCompetitionRanks([9, 7, 7, 5, 5, 5, 1], sameNumber)).toEqual([
			1, 2, 2, 4, 4, 4, 7,
		])
	})

	it('ranks an empty list and a single item', () => {
		expect(toCompetitionRanks([], sameNumber)).toEqual([])
		expect(toCompetitionRanks([3], sameNumber)).toEqual([1])
	})
})

describe('toPercentiles', () => {
	it('gives the share of strictly lower scores, ties equal', () => {
		expect(toPercentiles([9, 7, 7, 1])).toEqual([75, 25, 25, 0])
	})

	it('floors to one decimal and never reaches 100', () => {
		expect(toPercentiles([3, 2, 1])).toEqual([66.6, 33.3, 0])
		expect(
			toPercentiles(Array.from({ length: 2000 }, (_, index) => 2000 - index))[0]
		).toBe(99.9)
	})

	it('handles empty and single-contributor seasons', () => {
		expect(toPercentiles([])).toEqual([])
		expect(toPercentiles([42])).toEqual([0])
	})

	it('gives everyone 0 when all scores tie', () => {
		expect(toPercentiles([4, 4, 4])).toEqual([0, 0, 0])
	})
})

describe('topShareOf', () => {
	it.each([
		[99.9, 0.1],
		[97.3, 2.7],
		[50, 50],
		[0, 100],
		[100, 0.1],
		[99.99, 0.1],
		[101, 0.1],
		[97.26, 2.7],
		[83.7, 16.3],
	])('turns percentile %d into the top %d%%', (percentile, share) => {
		expect(topShareOf(percentile)).toBe(share)
	})
})
