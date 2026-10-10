import { describe, expect, it } from '@effect/vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ContributorView, SeasonView } from '../leaderboard-view'
import { ResultCard } from './result-card'

const SEASON = {
	id: '2026-10',
	status: 'provisional',
	daysIncluded: 4,
	daysInMonth: 31,
	lastDayIncluded: '2026-10-04',
	computedAt: '2026-10-05T06:00:00.000Z',
	contributors: 100,
	repositories: 20,
	mergedPullRequests: 500,
	excludedBots: 0,
} as const satisfies SeasonView

const CONTRIBUTOR = {
	login: 'alice',
	name: null,
	location: null,
	rank: 12,
	polandRank: null,
	percentile: 97,
	score: 100,
	mergedPullRequests: 5,
	selfMergedPullRequests: 0,
	repositories: [],
} as const satisfies ContributorView

describe('ResultCard', () => {
	it('omits the self-merge note when no pull requests were self-merged', () => {
		expect(
			renderToStaticMarkup(
				<ResultCard season={SEASON} contributor={CONTRIBUTOR} />
			)
		).not.toContain('self-merged')
	})

	it.each([
		[2, '2 of them were self-merged, which counts at half weight.'],
		[5, 'All of them were self-merged, which counts at half weight.'],
	])('explains %d self-merges', (selfMergedPullRequests, note) => {
		expect(
			renderToStaticMarkup(
				<ResultCard
					season={SEASON}
					contributor={{ ...CONTRIBUTOR, selfMergedPullRequests }}
				/>
			)
		).toContain(note)
	})
})
