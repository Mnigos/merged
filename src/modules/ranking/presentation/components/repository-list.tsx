import { ChevronIcon } from '@shared/ui/icons'
import { cn } from '@shared/utils/cn'
import { formatCount, formatNumber } from '../format'
import type { RepositoryLineView } from '../leaderboard-view'

/** Repositories listed before the rest fold into a disclosure. */
const VISIBLE_REPOSITORIES = 4

interface RepositoryLineProps {
	readonly repository: RepositoryLineView
}

const RepositoryLine = ({ repository }: Readonly<RepositoryLineProps>) => (
	<li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2.5 text-detail">
		<code
			className={cn(
				'truncate font-mono text-hint font-medium',
				repository.counted ? 'text-fg' : 'text-fg-3'
			)}
			title={repository.repository}
		>
			{repository.repository}
		</code>
		<span className="whitespace-nowrap text-fg-3">
			{formatNumber(repository.mergedPullRequests)} merged ·{' '}
			{repository.counted
				? `${formatNumber(repository.score)} pts`
				: 'not counted yet'}
		</span>
	</li>
)

interface RepositoryListProps {
	readonly repositories: readonly RepositoryLineView[]
}

/**
 * A contributor's repositories, counted ones first, each with merged pull
 * requests and points. Beyond four, the rest fold into a native disclosure
 * that opens without JavaScript.
 */
export const RepositoryList = ({
	repositories,
}: Readonly<RepositoryListProps>) => {
	const folded =
		repositories.length > VISIBLE_REPOSITORIES + 1
			? repositories.slice(VISIBLE_REPOSITORIES)
			: []
	const visible = repositories.slice(0, repositories.length - folded.length)
	const foldedMerged = folded.reduce(
		(total, repository) => total + repository.mergedPullRequests,
		0
	)
	const foldedScore = folded.reduce(
		(total, repository) => total + repository.score,
		0
	)

	return (
		<div className="mb-4">
			<ul className="grid gap-1.5">
				{visible.map(repository => (
					<RepositoryLine key={repository.repository} repository={repository} />
				))}
			</ul>
			{folded.length > 0 && (
				<details className="group mt-1.5">
					<summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-sm text-detail text-fg-3 transition-colors duration-150 hover:text-fg-2">
						<span className="flex items-center gap-1">
							<ChevronIcon className="size-3 shrink-0 self-center transition-transform duration-150 group-open:rotate-90" />
							{formatCount(
								folded.length,
								'more repository',
								'more repositories'
							)}
						</span>
						<span className="whitespace-nowrap">
							{formatNumber(foldedMerged)} merged · {formatNumber(foldedScore)}{' '}
							pts
						</span>
					</summary>
					<ul className="mt-1.5 grid max-h-64 gap-1.5 overflow-y-auto pr-1">
						{folded.map(repository => (
							<RepositoryLine
								key={repository.repository}
								repository={repository}
							/>
						))}
					</ul>
				</details>
			)}
		</div>
	)
}
