import { describe, expect, it } from '@effect/vitest'
import type { ShardEntry } from '@modules/ranking/domain/files/shard-file'
import { githubLoginSchema } from '@shared/schema/github-login'
import { BADGE_COLOR, toBadge, UNAVAILABLE_BADGE } from './badge'

const entry = (fields: Partial<ShardEntry>): ShardEntry => ({
	login: githubLoginSchema.make('k-wojcik'),
	rank: 12,
	percentile: 99.8,
	score: 1200,
	mergedPullRequests: 10,
	selfMergedPullRequests: 0,
	boards: { poland: null },
	repositories: [],
	name: null,
	location: null,
	excluded: null,
	...fields,
})

describe('toBadge', () => {
	it.each([
		[100, 97, '#100 · Oct 2026'],
		[101, 97, 'top 3% · Oct 2026'],
		[101, 100, 'top 0.1% · Oct 2026'],
		[101, null, '#101 · Oct 2026'],
	])('formats rank %d and percentile %s', (rank, percentile, message) => {
		expect(toBadge('2026-10', entry({ rank, percentile })).message).toBe(
			message
		)
	})

	it('distinguishes a valid unranked badge from an unavailable error', () => {
		expect(toBadge('2026-10', undefined)).toMatchObject({
			message: 'not ranked · Oct 2026',
		})
		expect(toBadge('2026-10', undefined).isError).toBeUndefined()
		expect(UNAVAILABLE_BADGE).toEqual({
			schemaVersion: 1,
			label: 'merged',
			message: 'unavailable',
			color: 'lightgrey',
			isError: true,
		})
	})
	it('shows the rank in the top 100', () => {
		expect(toBadge('2026-10', entry({ rank: 12 }))).toEqual({
			schemaVersion: 1,
			label: 'merged',
			message: '#12 · Oct 2026',
			color: BADGE_COLOR,
			namedLogo: 'github',
		})
	})

	it('shows the top share below the top 100', () => {
		expect(
			toBadge('2026-10', entry({ rank: 2400, percentile: 97 })).message
		).toBe('top 3% · Oct 2026')
		expect(
			toBadge('2026-10', entry({ rank: 640, percentile: 99.1 })).message
		).toBe('top 0.9% · Oct 2026')
	})

	it('says not ranked for an excluded or unknown contributor', () => {
		expect(
			toBadge(
				'2026-10',
				entry({ rank: null, percentile: null, excluded: 'bot' })
			).message
		).toBe('not ranked · Oct 2026')
		expect(toBadge('2026-11', undefined).message).toBe('not ranked · Nov 2026')
	})
})
