import { MergedIcon } from '@shared/ui/merged-icon'
import { Stat, StatGrid } from '@shared/ui/stat-grid'
import { StatePill } from '@shared/ui/state-pill'
import type { ReactNode } from 'react'
import {
	formatCount,
	formatNumber,
	formatTimes,
	formatTopPercent,
} from '../format'
import type { ContributorView, SeasonView } from '../leaderboard-view'
import { CardActions, CardFrame, CardTitle } from './card-frame'
import { RepositoryList } from './repository-list'

interface StandingLineProps {
	readonly contributor: ContributorView
}

const StandingLine = ({ contributor }: Readonly<StandingLineProps>) => {
	const profile = [contributor.name, contributor.location].filter(Boolean)

	return (
		<p className="text-sm text-fg-2 [&_b]:font-semibold [&_b]:text-fg">
			{profile.length > 0 && `${profile.join(' · ')} · `}
			<b>#{formatNumber(contributor.rank ?? 0)}</b> worldwide
			{contributor.polandRank !== null && (
				<>
					, <b>#{formatNumber(contributor.polandRank)}</b> in Poland
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
