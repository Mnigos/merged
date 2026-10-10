import { Avatar } from '@shared/ui/avatar'
import { Link } from '@tanstack/react-router'
import { formatNumber } from '../format'
import type { ContributorRowView } from '../leaderboard-view'
import {
	Cell,
	DESKTOP_ONLY,
	HeaderCell,
	NumberCell,
	RankCell,
	Row,
	Table,
} from './table-parts'

interface ContributorRowProps {
	readonly row: ContributorRowView
	readonly isVisitor: boolean
	readonly isDetached?: boolean
}

const ContributorRow = ({
	row,
	isVisitor,
	isDetached,
}: Readonly<ContributorRowProps>) => {
	const detail = [row.name, row.location].filter(Boolean).join(' · ')

	return (
		<Row
			aria-current={isVisitor ? 'true' : undefined}
			isDetached={isDetached}
			isVisitor={isVisitor}
		>
			<RankCell rank={row.rank} />
			<Cell className="w-full max-w-0">
				<div className="flex min-w-0 items-center gap-2.5">
					<Avatar login={row.login} />
					<div className="flex min-h-8.5 min-w-0 flex-col justify-center">
						<Link
							className="block truncate leading-tight font-semibold tracking-[-0.01em] decoration-fg-3 hover:underline"
							params={{ login: row.login }}
							to="/u/$login"
						>
							{row.login}
						</Link>
						{detail && (
							<small className="block truncate text-xs leading-snug text-fg-3">
								{detail}
							</small>
						)}
					</div>
				</div>
			</Cell>
			<Cell className={`${DESKTOP_ONLY} text-hint text-fg-2`}>
				{row.topRepository && (
					<span className="flex max-w-[34ch] items-baseline gap-1.5">
						<code
							className="truncate font-mono text-code font-medium"
							title={row.topRepository}
						>
							{row.topRepository}
						</code>
						{row.otherRepositories > 0 && (
							<span className="shrink-0 text-fg-3">
								+{row.otherRepositories}
							</span>
						)}
					</span>
				)}
			</Cell>
			<NumberCell className={`${DESKTOP_ONLY} text-fg-2`}>
				{formatNumber(row.mergedPullRequests)}
			</NumberCell>
			<NumberCell className="font-semibold text-fg">
				{formatNumber(row.score)}
			</NumberCell>
		</Row>
	)
}

interface LeaderboardTableProps {
	readonly caption: string
	readonly rows: readonly ContributorRowView[]
	/** Login whose row is highlighted. */
	readonly visitorLogin?: string
	/** The visitor's own row when it is below the rows shown, set apart at the end. */
	readonly visitorRow?: ContributorRowView
}

export const LeaderboardTable = ({
	caption,
	rows,
	visitorLogin,
	visitorRow,
}: Readonly<LeaderboardTableProps>) => (
	<Table>
		<caption className="sr-only">{caption}</caption>
		<thead>
			<tr>
				<HeaderCell className="w-11 pr-1 text-right">#</HeaderCell>
				<HeaderCell>Contributor</HeaderCell>
				<HeaderCell className={DESKTOP_ONLY}>Top repository</HeaderCell>
				<HeaderCell className={`${DESKTOP_ONLY} text-right`}>Merged</HeaderCell>
				<HeaderCell className="text-right">Score</HeaderCell>
			</tr>
		</thead>
		<tbody>
			{rows.map(row => (
				<ContributorRow
					isVisitor={row.login === visitorLogin}
					key={row.login}
					row={row}
				/>
			))}
			{visitorRow && <ContributorRow isDetached isVisitor row={visitorRow} />}
		</tbody>
	</Table>
)
