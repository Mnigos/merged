import type { ReactNode } from 'react'
import { formatSeasonName } from '../format'
import type { SeasonView } from '../leaderboard-view'

interface CardFrameProps {
	readonly season: SeasonView
	/** State badge at the top left, such as Merged. */
	readonly pill: ReactNode
	readonly titleId: string
	readonly children: ReactNode
}

/** The raised card of the hero, headed like a pull request: a state and the season. */
export const CardFrame = ({
	season,
	pill,
	titleId,
	children,
}: Readonly<CardFrameProps>) => (
	<article
		aria-labelledby={titleId}
		className="rounded-[14px] border border-line bg-linear-to-b from-bg-3 to-bg-2 px-4.5 pt-4.5 pb-4 shadow-card motion-safe:animate-rise"
	>
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			{pill}
			<time className="text-hint text-fg-3" dateTime={season.id}>
				{formatSeasonName(season.id)} · {season.daysIncluded} of{' '}
				{season.daysInMonth} days counted
			</time>
		</div>
		{children}
	</article>
)

interface CardTitleProps {
	readonly id: string
	/** `h1` when the card is the page's subject, as on a result page. */
	readonly as?: 'h1' | 'h2'
	readonly children: ReactNode
}

export const CardTitle = ({
	id,
	as: Heading = 'h2',
	children,
}: Readonly<CardTitleProps>) => (
	<Heading
		className="mt-3.5 mb-1 text-title font-semibold text-balance [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:font-medium [&_code]:tracking-normal [&_code]:break-all"
		id={id}
	>
		{children}
	</Heading>
)

interface CardActionsProps {
	readonly children?: ReactNode
}

/** Actions row with the recompute note on the right. */
export const CardActions = ({ children }: Readonly<CardActionsProps>) => (
	<div className="flex flex-wrap items-center gap-2">
		{children}
		<span className="ml-auto text-hint text-fg-3">
			Recomputed daily, 06:00 UTC
		</span>
	</div>
)
