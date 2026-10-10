import { Page } from '@shared/ui/page'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { SeasonView } from '../leaderboard-view'
import type { HomeSearch } from '../search-params'
import { SeasonStrip } from './season-strip'
import { TablePanel } from './table-parts'

const MORE_LINK =
	'flex justify-center border-t border-line bg-bg-2 p-3 text-detail text-fg-2 transition-colors duration-150 hover:text-fg'

interface LeaderboardSectionProps {
	readonly season: SeasonView
	readonly title: string
	readonly tabs?: ReactNode
	readonly children: ReactNode
}

/** The proof list: heading, season strip, optional tabs and a table panel. */
export const LeaderboardSection = ({
	season,
	title,
	tabs,
	children,
}: Readonly<LeaderboardSectionProps>) => (
	<section
		aria-labelledby="leaderboard-title"
		className="scroll-mt-14 pt-2 pb-14"
		id="leaderboard"
	>
		<Page>
			<div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 pt-4.5 pb-3.5">
				<h2
					className="text-lead font-semibold tracking-[-0.02em]"
					id="leaderboard-title"
				>
					{title}
				</h2>
				<SeasonStrip season={season} />
				{tabs}
			</div>
			<TablePanel>{children}</TablePanel>
		</Page>
	</section>
)

interface RowsToggleProps {
	readonly search: HomeSearch
	readonly shownRows: number
	readonly availableRows: number
}

/** "Show positions 26 to 100", or back to the top 25 once expanded. */
export const RowsToggle = ({
	search,
	shownRows,
	availableRows,
}: Readonly<RowsToggleProps>) => {
	if (availableRows <= 25) return null
	if (shownRows < availableRows)
		return (
			<Link
				className={MORE_LINK}
				resetScroll={false}
				search={{ ...search, rows: 100 }}
				to="/"
			>
				Show positions {shownRows + 1} to {availableRows}
			</Link>
		)

	return (
		<Link
			className={MORE_LINK}
			hash="leaderboard"
			search={{ ...search, rows: 25 }}
			to="/"
		>
			Show the top 25 only
		</Link>
	)
}

/** Link from a result page to the whole Global board. */
export const FullBoardLink = () => (
	<Link
		className={MORE_LINK}
		hash="leaderboard"
		search={{ board: 'global', rows: 100 }}
		to="/"
	>
		Show positions 26 to 100
	</Link>
)

interface EmptyBoardProps {
	readonly title: string
	readonly children: ReactNode
}

export const EmptyBoard = ({ title, children }: Readonly<EmptyBoardProps>) => (
	<div className="px-5 py-12 text-center">
		<p className="text-sm font-medium text-fg">{title}</p>
		<p className="mx-auto mt-1 max-w-[52ch] text-hint text-pretty text-fg-3">
			{children}
		</p>
	</div>
)
