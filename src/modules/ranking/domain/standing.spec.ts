import { describe, expect, it } from '@effect/vitest'
import { repositoryStanding } from './standing'

describe('repositoryStanding', () => {
	it('uses contributors plus stars in season without enrichment', () => {
		expect(
			repositoryStanding({
				contributors: 4,
				starsInSeason: 30,
				stars: undefined,
			})
		).toBe(34)
	})

	it('uses real stars plus contributors when enriched, ignoring season stars', () => {
		expect(
			repositoryStanding({ contributors: 4, starsInSeason: 30, stars: 12_000 })
		).toBe(12_004)
	})

	it('keeps an enriched repository with 0 stars at its contributors', () => {
		expect(
			repositoryStanding({ contributors: 2, starsInSeason: 9, stars: 0 })
		).toBe(2)
	})
})
