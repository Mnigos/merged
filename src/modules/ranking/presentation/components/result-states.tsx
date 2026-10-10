import { buttonClassName } from '@shared/ui/button'
import { ArrowUpRightIcon, EmptyCircleIcon, SkipIcon } from '@shared/ui/icons'
import { StatePill } from '@shared/ui/state-pill'
import { Link } from '@tanstack/react-router'
import {
	formatCount,
	formatDay,
	formatSeasonName,
	formatTimes,
} from '../format'
import type { ContributorView, SeasonView } from '../leaderboard-view'
import { CardActions, CardFrame, CardTitle } from './card-frame'
import { RepositoryList } from './repository-list'

const BODY = 'text-sm text-fg-2 text-pretty'

interface ExcludedResultCardProps {
	readonly season: SeasonView
	readonly contributor: ContributorView
}

/** Merged, but into repositories that do not count yet: listed, not ranked. */
export const NoCountedRepositoryCard = ({
	season,
	contributor,
}: Readonly<ExcludedResultCardProps>) => (
	<CardFrame
		pill={
			<StatePill tone="neutral">
				<SkipIcon />
				Not counted yet
			</StatePill>
		}
		season={season}
		titleId="result-title"
	>
		<CardTitle as="h1" id="result-title">
			<code>{contributor.login}</code> got merged{' '}
			{formatTimes(contributor.mergedPullRequests)}, but none of those
			repositories counts yet
		</CardTitle>
		<p className={`${BODY} mb-4`}>
			A repository counts once someone besides you contributed to it or starred
			it this season, or it has at least 10 stars.
		</p>
		<RepositoryList repositories={contributor.repositories} />
		<CardActions>
			<Link className={buttonClassName({ variant: 'ghost' })} to="/methodology">
				How repositories count
			</Link>
		</CardActions>
	</CardFrame>
)

/** A login the bot rules exclude. */
export const BotResultCard = ({
	season,
	contributor,
}: Readonly<ExcludedResultCardProps>) => (
	<CardFrame
		pill={
			<StatePill tone="neutral">
				<SkipIcon />
				Excluded
			</StatePill>
		}
		season={season}
		titleId="result-title"
	>
		<CardTitle as="h1" id="result-title">
			<code>{contributor.login}</code> is excluded as a bot
		</CardTitle>
		<p className={`${BODY} mb-4`}>
			It got merged {formatTimes(contributor.mergedPullRequests)} into{' '}
			{formatCount(
				contributor.repositories.length,
				'repository',
				'repositories'
			)}{' '}
			in {formatSeasonName(season.id)}, but accounts that look like automation
			never rank: a <code className="font-mono text-hint">[bot]</code> suffix,
			names such as <code className="font-mono text-hint">release-bot</code>, or
			the known list. If this is a person, open an issue.
		</p>
		<CardActions>
			<a
				className={buttonClassName({ variant: 'ghost' })}
				href="https://github.com/Mnigos/merged/issues"
			>
				Open an issue
				<ArrowUpRightIcon />
			</a>
		</CardActions>
	</CardFrame>
)

interface NotFoundResultCardProps {
	readonly season: SeasonView
	readonly login: string
}

/** No merged pull requests into other people's repositories this season, yet. */
export const NotFoundResultCard = ({
	season,
	login,
}: Readonly<NotFoundResultCardProps>) => (
	<CardFrame
		pill={
			<StatePill tone="neutral">
				<EmptyCircleIcon />
				No merges yet
			</StatePill>
		}
		season={season}
		titleId="result-title"
	>
		<CardTitle as="h1" id="result-title">
			No merged pull requests into other people’s repositories for{' '}
			<code>{login}</code> in {formatSeasonName(season.id)} yet
		</CardTitle>
		<p className={`${BODY} mb-4`}>
			{season.lastDayIncluded && season.status === 'provisional'
				? `Counted through ${formatDay(season.lastDayIncluded)}. If you got merged after that, check back tomorrow.`
				: 'Only pull requests merged into repositories you do not own are counted.'}
		</p>
		<CardActions>
			<a
				className={buttonClassName({ variant: 'ghost' })}
				href={`https://github.com/${login}`}
			>
				github.com/{login}
				<ArrowUpRightIcon />
			</a>
		</CardActions>
	</CardFrame>
)
