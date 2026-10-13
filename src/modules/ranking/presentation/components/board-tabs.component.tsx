import {
	SegmentedTab,
	SegmentedTabs,
} from '@shared/ui/segmented-tabs.component'
import { cn } from '@shared/utils/cn.util'
import type { CountryView } from '../leaderboard-view.model'
import type { BoardId, HomeSearch } from '../search-params.helper'
import { CountrySelect } from './country-select.component'

const BOARD_TABS = [
	{ board: 'global', label: 'Global' },
	{ board: 'repositories', label: 'Repositories' },
] as const satisfies readonly { board: BoardId; label: string }[]

interface BoardTabsProps {
	readonly search: HomeSearch
	/** Countries with a board this season, most contributors first. */
	readonly countries: readonly CountryView[]
}

/**
 * Global and Repositories as links that set `?board=` and keep `?rows=`,
 * then a select of the season's country boards when there are any.
 */
export const BoardTabs = ({ search, countries }: Readonly<BoardTabsProps>) => (
	<SegmentedTabs aria-label="Boards" className="w-full md:ml-auto md:w-auto">
		{BOARD_TABS.map(tab => (
			<SegmentedTab
				isCurrent={tab.board === search.board}
				className={cn(
					'text-center md:flex-none',
					countries.length > 0 ? 'flex-none' : 'flex-1'
				)}
				key={tab.board}
				resetScroll={false}
				search={previous => ({ ...previous, board: tab.board })}
				to="/"
			>
				{tab.label}
			</SegmentedTab>
		))}
		{countries.length > 0 && (
			<CountrySelect countries={countries} search={search} />
		)}
	</SegmentedTabs>
)
