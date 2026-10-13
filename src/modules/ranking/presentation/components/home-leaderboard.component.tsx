import { formatNumber, formatSeasonName } from '../format.helper'
import type { BoardView, SeasonView } from '../leaderboard-view.model'
import type { BoardSelection } from '../page-data.helper'
import type { HomeSearch } from '../search-params.helper'
import { BoardTabs } from './board-tabs.component'
import {
	EmptyBoard,
	LeaderboardSection,
	RowsToggle,
} from './leaderboard-section.component'
import { LeaderboardTable } from './leaderboard-table.component'
import { RepositoryTable } from './repository-table.component'

const getBoardCaption = (selection: BoardSelection) => {
	if (selection.kind === 'repositories')
		return 'Repositories by outside contributors'

	return selection.board.country
		? `${selection.board.country.name} leaderboard`
		: 'Global leaderboard'
}

interface BoardTitleProps {
	readonly board: BoardView
}

/** "Leaderboard", or "Poland · 1,204 contributors" on a country board. */
const BoardTitle = ({ board }: Readonly<BoardTitleProps>) =>
	board.country ? (
		<>
			{board.country.name}
			<span className="font-normal text-fg-3">
				{' '}
				· {formatNumber(board.country.contributors)} contributors
			</span>
		</>
	) : (
		'Leaderboard'
	)

interface HomeLeaderboardProps {
	readonly season: SeasonView
	readonly search: HomeSearch
	readonly selection: BoardSelection
}

/** The leaderboard of `/`, with the board chosen in `?board=`. */
export const HomeLeaderboard = ({
	season,
	search,
	selection,
}: Readonly<HomeLeaderboardProps>) => {
	const caption = `${getBoardCaption(selection)}, ${formatSeasonName(season.id)}`
	const tabs = <BoardTabs countries={season.countries} search={search} />

	if (selection.kind === 'repositories')
		return (
			<LeaderboardSection season={season} tabs={tabs} title="Leaderboard">
				<RepositoryTable caption={caption} rows={selection.rows} />
				<RowsToggle
					availableRows={selection.availableRows}
					search={search}
					shownRows={selection.rows.length}
				/>
			</LeaderboardSection>
		)

	const { board } = selection

	return (
		<LeaderboardSection
			season={season}
			tabs={tabs}
			title={<BoardTitle board={board} />}
		>
			{board.rows.length === 0 ? (
				<EmptyBoard title="No contributor is ranked yet this season.">
					The board fills once a day of merged pull requests has been counted.
				</EmptyBoard>
			) : (
				<LeaderboardTable caption={caption} rows={board.rows} />
			)}
			<RowsToggle
				availableRows={board.availableRows}
				search={search}
				shownRows={board.rows.length}
			/>
		</LeaderboardSection>
	)
}
