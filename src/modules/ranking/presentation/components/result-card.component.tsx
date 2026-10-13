import { MergedIcon } from '@shared/ui/merged-icon.component'
import { Stat, StatGrid } from '@shared/ui/stat-grid.component'
import { StatePill } from '@shared/ui/state-pill.component'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
	formatCount,
	formatNumber,
	formatTimes,
	formatTopPercent,
} from '../format.helper'
import type { ContributorView, SeasonView } from '../leaderboard-view.model'
import { CardActions, CardFrame, CardTitle } from './card-frame.component'
import { RepositoryList } from './repository-list.component'

interface StandingLineProps {
	readonly contributor: ContributorView
}

const StandingLine = ({ contributor }: Readonly<StandingLineProps>) => {
	const profile = [contributor.name, contributor.location].filter(Boolean)

	return (
		<p className="text-sm text-fg-2 [&_b]:font-semibold [&_b]:text-fg">
			{profile.length > 0 && `${profile.join(' · ')} · `}
			<b>#{formatNumber(contributor.rank ?? 0)}</b> worldwide
			{contributor.country && (
				<>
					,{' '}
					<Link
						className="underline decoration-line-2 hover:decoration-fg-2"
						hash="leaderboard"
						search={{ board: contributor.country.code }}
						to="/"
					>
						<b>#{formatNumber(contributor.country.rank)}</b> in{' '}
						{contributor.country.name} {contributor.country.flag}
					</Link>
				</>
			)}
		</p>
	)
}

interface ResultCardProps {
	readonly season: SeasonView
	readonly contributor: ContributorView
	/** Share actions, owned by the share module. */
	readonly actions?: ReactNode
}

/** A ranked contributor's season, drawn as a merged pull request. */
export const ResultCard = ({
	season,
	contributor,
	actions,
}: Readonly<ResultCardProps>) => (
	<CardFrame
		pill={
			<StatePill>
				<MergedIcon />
				Merged
			</StatePill>
		}
		season={season}
		titleId="result-title"
	>
		<CardTitle as="h1" id="result-title">
			<code>{contributor.login}</code> got merged{' '}
			{formatTimes(contributor.mergedPullRequests)} into{' '}
			{formatCount(
				contributor.repositories.length,
				'repository',
				'repositories'
			)}
		</CardTitle>
		<StandingLine contributor={contributor} />
		<StatGrid className="my-4">
			<Stat
				label="rank"
				unit={`of ${formatNumber(season.contributors)}`}
				value={`#${formatNumber(contributor.rank ?? 0)}`}
			/>
			<Stat label="score" unit="pts" value={formatNumber(contributor.score)} />
			<Stat
				label="top percentile"
				value={formatTopPercent(contributor.percentile ?? 0)}
			/>
		</StatGrid>
		<RepositoryList repositories={contributor.repositories} />
		{contributor.selfMergedPullRequests > 0 && (
			<p className="-mt-1.5 mb-4 text-hint text-fg-3">
				{contributor.selfMergedPullRequests === contributor.mergedPullRequests
					? 'All of them were self-merged'
					: `${formatNumber(contributor.selfMergedPullRequests)} of them were self-merged`}
				, which counts at half weight.
			</p>
		)}
		<CardActions>{actions}</CardActions>
	</CardFrame>
)
