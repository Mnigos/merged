import { ChevronIcon } from '@shared/ui/icons.component'
import { cn } from '@shared/utils/cn.util'
import { useNavigate } from '@tanstack/react-router'
import { formatNumber } from '../format.helper'
import type { CountryView } from '../leaderboard-view.model'
import { HOME_SEARCH_DEFAULTS, type HomeSearch } from '../search-params.helper'

interface CountrySelectProps {
	readonly countries: readonly CountryView[]
	readonly search: HomeSearch
}

/**
 * The season's country boards as a native select drawn like a tab: picking
 * one sets `?board=<code>` and keeps `?rows=`. Without JavaScript it is a GET
 * form with its own submit button.
 */
export const CountrySelect = ({
	countries,
	search,
}: Readonly<CountrySelectProps>) => {
	const navigate = useNavigate()
	const current = countries.find(country => country.code === search.board)

	return (
		<form
			action="/"
			className="relative flex min-w-0 flex-1 md:flex-none"
			method="get"
		>
			{search.rows !== HOME_SEARCH_DEFAULTS.rows && (
				<input name="rows" type="hidden" value={search.rows} />
			)}
			<select
				aria-label="Country board"
				className={cn(
					'w-full cursor-pointer appearance-none truncate rounded-md py-1.25 pr-6.5 pl-2.5 text-hint font-medium transition-colors duration-150 hover:text-fg',
					current ? 'bg-bg-3 text-fg shadow-raised' : 'bg-transparent text-fg-2'
				)}
				name="board"
				onChange={event =>
					void navigate({
						to: '/',
						search: previous => ({ ...previous, board: event.target.value }),
						resetScroll: false,
					})
				}
				value={current?.code ?? ''}
			>
				{!current && (
					<option disabled value="">
						Country
					</option>
				)}
				{countries.map(country => (
					<option
						className="bg-bg-2 text-fg"
						key={country.code}
						value={country.code}
					>
						{country.flag} {country.name} · {formatNumber(country.contributors)}
					</option>
				))}
			</select>
			<ChevronIcon className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 rotate-90 text-fg-3" />
			<noscript>
				<button
					className="ml-0.5 rounded-md px-2.5 py-1.25 text-hint font-medium text-fg hover:bg-bg-3"
					type="submit"
				>
					Show
				</button>
			</noscript>
		</form>
	)
}
