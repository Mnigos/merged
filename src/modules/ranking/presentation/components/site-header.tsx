import { SearchIcon } from '@shared/ui/icons'
import { Kbd } from '@shared/ui/kbd'
import { MergedIcon } from '@shared/ui/merged-icon'
import { Page } from '@shared/ui/page'
import { Link } from '@tanstack/react-router'
import type { MouseEvent } from 'react'
import { LOOKUP_INPUT_ID } from './lookup-form'
import { useShortcutLabel } from './use-shortcut-label'

const NAV_LINK =
	'rounded-[7px] px-2.5 py-1.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-bg-3 hover:text-fg aria-[current=page]:bg-bg-3 aria-[current=page]:text-fg'

/** Focuses the lookup field when the page has one; otherwise the link goes home to it. */
function focusLookup(event: MouseEvent<HTMLAnchorElement>) {
	const field = document.querySelector(`#${LOOKUP_INPUT_ID}`)
	if (!(field instanceof HTMLInputElement)) return
	event.preventDefault()
	field.focus()
	field.select()
}

export const SiteHeader = () => {
	const shortcut = useShortcutLabel()

	return (
		<header className="sticky top-0 z-10 border-b border-line bg-bg/92">
			<Page className="flex h-14 items-center gap-5.5">
				<Link
					className="flex items-center gap-2.25 text-body font-semibold tracking-[-0.01em]"
					to="/"
				>
					<MergedIcon className="size-4.5 text-merged" />
					merged
				</Link>
				<nav aria-label="Main" className="hidden gap-1 md:flex">
					<Link
						activeOptions={{ exact: true, includeSearch: false }}
						className={NAV_LINK}
						to="/"
					>
						Leaderboard
					</Link>
					<Link className={NAV_LINK} to="/methodology">
						Methodology
					</Link>
				</nav>
				<Link
					className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-line bg-bg-2 pr-2 pl-2.5 text-hint text-fg-2 transition-colors duration-150 hover:border-line-2 hover:text-fg"
					hash={LOOKUP_INPUT_ID}
					onClick={focusLookup}
					to="/"
				>
					<SearchIcon className="size-3.5 text-fg-3 md:hidden" />
					Search a login
					<Kbd className="hidden md:inline">{shortcut}</Kbd>
				</Link>
			</Page>
		</header>
	)
}
