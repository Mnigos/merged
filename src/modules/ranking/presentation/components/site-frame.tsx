import type { ReactNode } from 'react'
import type { SeasonView } from '../leaderboard-view'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

interface SiteFrameProps {
	readonly season: SeasonView | null
	readonly children: ReactNode
}

/** Skip link, header, the page and the footer around every route. */
export const SiteFrame = ({ season, children }: Readonly<SiteFrameProps>) => (
	<>
		<a
			className="sr-only rounded-lg bg-fg px-3 py-2 text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-20"
			href="#main"
		>
			Skip to content
		</a>
		<SiteHeader />
		<main className="outline-none" id="main" tabIndex={-1}>
			{children}
		</main>
		<SiteFooter season={season} />
	</>
)
