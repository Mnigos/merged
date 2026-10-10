import { formatSeasonName } from '../format'
import type { SeasonView } from '../leaderboard-view'
import type { BoardSelection } from '../page-data'
import type { HomeSearch } from '../search-params'
import { BoardTabs } from './board-tabs'
import {
	EmptyBoard,
	LeaderboardSection,
	RowsToggle,
} from './leaderboard-section'
import { LeaderboardTable } from './leaderboard-table'
import { RepositoryTable } from './repository-table'

const BOARD_CAPTION = {
	global: 'Global leaderboard',
	poland: 'Poland leaderboard',
	repositories: 'Repositories by outside contributors',
} as const satisfies Record<HomeSearch['board'], string>

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
	const caption = `${BOARD_CAPTION[search.board]}, ${formatSeasonName(season.id)}`

	if (selection.kind === 'repositories')
		return (
			<LeaderboardSection
				season={season}
				tabs={<BoardTabs current={search.board} />}
				title="Leaderboard"
			>
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
			tabs={<BoardTabs current={search.board} />}
			title="Leaderboard"
		>
			{board.rows.length === 0 ? (
				<EmptyBoard
					title={
						board.id === 'poland'
							? 'No contributors with a Polish location yet this season.'
							: 'No contributor is ranked yet this season.'
					}
				>
					{board.id === 'poland'
						? 'Locations come from GitHub profiles of the top contributors, fetched daily. The board fills as they are.'
						: 'The board fills once a day of merged pull requests has been counted.'}
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
