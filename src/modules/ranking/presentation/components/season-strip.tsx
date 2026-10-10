import { formatSeasonMonth } from '../format'
import type { SeasonView } from '../leaderboard-view'

interface SeasonStripProps {
	readonly season: SeasonView
}

/** How much of the month the season holds: a short bar and the day count. */
export const SeasonStrip = ({ season }: Readonly<SeasonStripProps>) => (
	<p className="flex items-center gap-2.5 text-hint text-fg-3">
		<span
			aria-hidden="true"
			className="relative block h-1 w-18 overflow-hidden rounded-xs bg-bg-3"
		>
			<span
				className="absolute inset-y-0 left-0 rounded-xs bg-fg-2"
				style={{
					width: `${(season.daysIncluded / season.daysInMonth) * 100}%`,
				}}
			/>
		</span>
		{formatSeasonMonth(season.id)}, {season.daysIncluded} of{' '}
		{season.daysInMonth} days counted
	</p>
)
