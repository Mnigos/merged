import { formatSeasonName } from '../format'
import type {
	BoardView,
	ContributorRowView,
	SeasonView,
} from '../leaderboard-view'
import { FullBoardLink, LeaderboardSection } from './leaderboard-section'
import { LeaderboardTable } from './leaderboard-table'

interface ResultLeaderboardProps {
	readonly season: SeasonView
	readonly board: BoardView
	readonly visitorLogin: string
	readonly visitorRow: ContributorRowView | null
}

/** The Global top 25 under a result, the visitor's row highlighted or appended. */
export const ResultLeaderboard = ({
	season,
	board,
	visitorLogin,
	visitorRow,
}: Readonly<ResultLeaderboardProps>) => (
	<LeaderboardSection season={season} title="Global leaderboard">
		<LeaderboardTable
			caption={`Global leaderboard, ${formatSeasonName(season.id)}`}
			rows={board.rows}
			visitorLogin={visitorLogin}
			visitorRow={visitorRow ?? undefined}
		/>
		{board.availableRows > board.rows.length && <FullBoardLink />}
	</LeaderboardSection>
)
