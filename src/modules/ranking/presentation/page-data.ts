import type {
	BoardView,
	ContributorResult,
	ContributorRowView,
	RepositoryRowView,
	SeasonView,
} from './leaderboard-view'
import {
	getBoard,
	getContributorResult,
	getRepositoryBoard,
} from './leaderboard.functions'
import type { HomeSearch } from './search-params'
import { toVisitorRow } from './visitor-row'

/** Rows of the Global board the season card lists. */
export const LEADERS = 3

export type BoardSelection =
	| { readonly kind: 'contributors'; readonly board: BoardView }
	| {
			readonly kind: 'repositories'
			readonly rows: readonly RepositoryRowView[]
			readonly availableRows: number
	  }

export interface HomeData {
	/** Server time when the page loaded, for relative labels on first paint. */
	readonly renderedAt: number
	readonly season: SeasonView
	readonly leaders: readonly ContributorRowView[]
	readonly selection: BoardSelection
}

async function loadSelection(
	season: string,
	{ board, rows }: HomeSearch
): Promise<BoardSelection | undefined> {
	if (board === 'global') return undefined
	if (board === 'poland') {
		const poland = await getBoard({ data: { season, board, rows } })

		return { kind: 'contributors', board: poland.board }
	}
	const repositories = await getRepositoryBoard({ data: { season, rows } })

	return {
		kind: 'repositories',
		rows: repositories.rows,
		availableRows: repositories.availableRows,
	}
}

/** Everything `/` shows for a season: the season card's leaders and the selected board. */
export async function loadHomeData(
	season: string,
	search: HomeSearch,
	renderedAt: number
): Promise<HomeData> {
	const [global, selection] = await Promise.all([
		getBoard({
			data: {
				season,
				board: 'global',
				rows: search.board === 'global' ? search.rows : 25,
			},
		}),
		loadSelection(season, search),
	])

	return {
		renderedAt,
		season: global.season,
		leaders: global.board.rows.slice(0, LEADERS),
		selection: selection ?? { kind: 'contributors', board: global.board },
	}
}

export interface ContributorPageData {
	readonly result: ContributorResult
	readonly board: BoardView
	readonly visitorRow: ContributorRowView | null
}

/** A lookup result and the Global board's top 25 under it. */
export async function loadContributorPageData(
	season: string,
	login: string
): Promise<ContributorPageData> {
	const [result, global] = await Promise.all([
		getContributorResult({ data: { season, login } }),
		getBoard({ data: { season, board: 'global', rows: 25 } }),
	])

	return {
		result,
		board: global.board,
		visitorRow: toVisitorRow(result.outcome, global.board.rows) ?? null,
	}
}
