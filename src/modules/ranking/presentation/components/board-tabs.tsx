import { SegmentedTab, SegmentedTabs } from '@shared/ui/segmented-tabs'
import type { BoardId } from '../search-params'

const BOARD_TABS = [
	{ board: 'global', label: 'Global' },
	{ board: 'poland', label: 'Poland' },
	{ board: 'repositories', label: 'Repositories' },
] as const satisfies readonly { board: BoardId; label: string }[]

interface BoardTabsProps {
	readonly current: BoardId
}

/** Global, Poland and Repositories as links that set `?board=` and keep `?rows=`. */
export const BoardTabs = ({ current }: Readonly<BoardTabsProps>) => (
	<SegmentedTabs aria-label="Boards" className="w-full md:ml-auto md:w-auto">
		{BOARD_TABS.map(tab => (
			<SegmentedTab
				isCurrent={tab.board === current}
				className="flex-1 text-center md:flex-none"
				key={tab.board}
				resetScroll={false}
				search={previous => ({ ...previous, board: tab.board })}
				to="/"
			>
				{tab.label}
			</SegmentedTab>
		))}
	</SegmentedTabs>
)
