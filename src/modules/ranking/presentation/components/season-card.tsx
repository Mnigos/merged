import { Avatar } from '@shared/ui/avatar'
import { CheckIcon, ProgressIcon } from '@shared/ui/icons'
import { Stat, StatGrid } from '@shared/ui/stat-grid'
import { StatePill } from '@shared/ui/state-pill'
import { Link } from '@tanstack/react-router'
import { formatNumber, formatRelativeTime, formatSeasonName } from '../format'
import type { ContributorRowView, SeasonView } from '../leaderboard-view'
import { CardFrame } from './card-frame'
import { useNow } from './use-now'

interface SeasonCardProps {
	readonly season: SeasonView
	/** The Global board's first rows. */
	readonly leaders: readonly ContributorRowView[]
	/** Server time when the page loaded; the clock takes over on the client. */
	readonly renderedAt: number
}

/** The season at a glance, in the same pull request frame as a result. */
export const SeasonCard = ({
	season,
	leaders,
	renderedAt,
}: Readonly<SeasonCardProps>) => {
	const isFinal = season.status === 'final'
	const now = useNow(renderedAt)

	return (
		<CardFrame
			pill={
				<StatePill tone="neutral">
					{isFinal ? <CheckIcon /> : <ProgressIcon />}
					{isFinal ? 'Final' : 'Provisional'}
				</StatePill>
			}
			season={season}
			titleId="season-title"
		>
			<h2 className="mt-3.5 mb-1 text-title font-semibold" id="season-title">
				{formatSeasonName(season.id)} season
			</h2>
			<p className="text-sm text-fg-2">
				{isFinal
					? 'The month is closed; these results no longer change.'
					: 'Ranks move every day until the month closes.'}
			</p>
			<StatGrid className="my-4">
				<Stat
					label="contributors ranked"
					value={formatNumber(season.contributors)}
				/>
				<Stat
					label="merged PRs counted"
					value={formatNumber(season.mergedPullRequests)}
				/>
				<Stat label="repositories" value={formatNumber(season.repositories)} />
			</StatGrid>
			{leaders.length > 0 && (
				<ol aria-label="Top 3" className="mb-4 grid gap-1">
					{leaders.map(leader => (
						<li key={leader.login}>
							<Link
								className="-mx-2 grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1 transition-colors duration-150 hover:bg-bg-3"
								params={{ login: leader.login }}
								to="/u/$login"
							>
								<span className="text-right text-hint font-medium text-fg-3">
									{leader.rank}
								</span>
								<Avatar login={leader.login} size={22} />
								<span className="truncate text-sm font-semibold tracking-[-0.01em]">
									{leader.login}
								</span>
								<span className="text-detail whitespace-nowrap text-fg-2 tabular-nums">
									{formatNumber(leader.score)}{' '}
									<span className="text-fg-3">pts</span>
								</span>
							</Link>
						</li>
					))}
				</ol>
			)}
			<p className="text-hint text-fg-3">
				Recomputed daily, 06:00 UTC · updated{' '}
				<time dateTime={season.computedAt}>
					{formatRelativeTime(season.computedAt, now)}
				</time>
			</p>
		</CardFrame>
	)
}
