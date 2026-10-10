import { formatNumber } from '../format'
import type { RepositoryRowView } from '../leaderboard-view'
import {
	Cell,
	DESKTOP_ONLY,
	HeaderCell,
	NumberCell,
	RankCell,
	Row,
	Table,
} from './table-parts'

interface RepositoryTableProps {
	readonly caption: string
	readonly rows: readonly RepositoryRowView[]
}

/** Repositories by outside contributors this season. */
export const RepositoryTable = ({
	caption,
	rows,
}: Readonly<RepositoryTableProps>) => (
	<Table>
		<caption className="sr-only">{caption}</caption>
		<thead>
			<tr>
				<HeaderCell className="w-11 pr-1 text-right">#</HeaderCell>
				<HeaderCell>Repository</HeaderCell>
				<HeaderCell className="text-right">Contributors</HeaderCell>
				<HeaderCell className={`${DESKTOP_ONLY} text-right`}>Merged</HeaderCell>
				<HeaderCell className={`${DESKTOP_ONLY} text-right`}>Stars</HeaderCell>
			</tr>
		</thead>
		<tbody>
			{rows.map(row => (
				<Row key={row.repository}>
					<RankCell rank={row.rank} />
					<Cell className="w-full max-w-0">
						<div className="flex min-h-8.5 min-w-0 flex-col justify-center">
							<a
								className="block truncate font-mono text-hint leading-tight font-medium decoration-fg-3 hover:underline"
								href={`https://github.com/${row.repository}`}
								title={row.repository}
							>
								{row.repository}
							</a>
							{row.language && (
								<small className="block truncate text-xs leading-snug text-fg-3">
									{row.language}
								</small>
							)}
						</div>
					</Cell>
					<NumberCell className="font-semibold text-fg">
						{formatNumber(row.contributors)}
					</NumberCell>
					<NumberCell className={`${DESKTOP_ONLY} text-fg-2`}>
						{formatNumber(row.mergedPullRequests)}
					</NumberCell>
					<NumberCell className={`${DESKTOP_ONLY} text-fg-2`}>
						{row.stars === null ? (
							<span className="text-fg-3">not fetched</span>
						) : (
							formatNumber(row.stars)
						)}
					</NumberCell>
				</Row>
			))}
		</tbody>
	</Table>
)
