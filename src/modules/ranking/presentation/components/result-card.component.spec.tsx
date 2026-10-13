import { describe, expect, it } from '@effect/vitest'
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ContributorView, SeasonView } from '../leaderboard-view.model'
import { ResultCard } from './result-card.component'

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
	countries: [{ code: 'pl', name: 'Poland', flag: '🇵🇱', contributors: 40 }],
} as const satisfies SeasonView

const CONTRIBUTOR = {
	login: 'alice',
	name: null,
	location: null,
	rank: 12,
	country: null,
	percentile: 97,
	score: 100,
	mergedPullRequests: 5,
	selfMergedPullRequests: 0,
	repositories: [],
} as const satisfies ContributorView

const router = createRouter({
	routeTree: createRootRoute(),
	history: createMemoryHistory(),
})

const renderInRouter = (children: ReactNode) =>
	renderToStaticMarkup(
		<RouterContextProvider router={router}>{children}</RouterContextProvider>
	)

describe('ResultCard', () => {
	it('links the country rank to its board', () => {
		const markup = renderInRouter(
			<ResultCard
				season={SEASON}
				contributor={{
					...CONTRIBUTOR,
					country: { code: 'pl', name: 'Poland', flag: '🇵🇱', rank: 3 },
				}}
			/>
		)

		expect(markup).toContain('href="/?board=pl#leaderboard"')
		expect(markup).toMatch(/<b>#3<\/b> in Poland 🇵🇱<\/a>/u)
	})

	it('names only the worldwide rank without a country board', () => {
		const markup = renderInRouter(
			<ResultCard season={SEASON} contributor={CONTRIBUTOR} />
		)

		expect(markup).toContain('<b>#12</b> worldwide')
		expect(markup).not.toContain('board=')
		expect(markup).not.toContain(' in ')
	})

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
