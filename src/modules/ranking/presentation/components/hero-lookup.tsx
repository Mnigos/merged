import { formatNumber, formatSeasonMonth } from '../format'
import type { SeasonView } from '../leaderboard-view'
import { LookupForm } from './lookup-form'

interface HeroLookupProps {
	readonly season: SeasonView
	readonly defaultLogin?: string
	/** `h2` when a result card above carries the page's `h1`. */
	readonly headlineAs?: 'h1' | 'h2'
}

/** Headline, one-line pitch and the lookup command bar. */
export const HeroLookup = ({
	season,
	defaultLogin,
	headlineAs: Headline = 'h1',
}: Readonly<HeroLookupProps>) => (
	<>
		<Headline className="max-w-[16ch] text-display font-semibold text-balance md:text-display-lg">
			Who actually got merged this month.
		</Headline>
		<p className="mt-3.5 max-w-[48ch] text-base text-pretty text-fg-2 md:text-lead">
			A monthly ranking of open source contributors, built from pull requests
			merged into repositories they don’t own. Bots and your own repos count for
			nothing; self-merges count half.
		</p>
		<LookupForm
			defaultLogin={defaultLogin}
			hint={
				<>
					No sign-in. <b>{formatNumber(season.contributors)}</b> contributors
					scored {season.status === 'provisional' ? 'so far ' : ''}in{' '}
					{formatSeasonMonth(season.id)}.
				</>
			}
		/>
	</>
)
