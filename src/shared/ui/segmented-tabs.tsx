import { cn } from '@shared/utils/cn'
import { createLink } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

/** A row of tabs that are links; the current one carries `aria-current="page"`. */
export const SegmentedTabs = ({
	className,
	...props
}: Readonly<ComponentProps<'nav'>>) => (
	<nav
		className={cn(
			'flex max-w-full [scrollbar-width:none] gap-0.5 overflow-x-auto rounded-[9px] border border-line bg-bg-2 p-[3px]',
			className
		)}
		{...props}
	/>
)

interface SegmentedTabAnchorProps extends ComponentProps<'a'> {
	/** Whether this tab is the current one; decided by the caller, not by URL matching. */
	readonly isCurrent: boolean
}

const SegmentedTabAnchor = ({
	className,
	children,
	isCurrent,
	...props
}: Readonly<SegmentedTabAnchorProps>) => (
	<a
		className={cn(
			'rounded-md px-2.5 py-1.25 text-hint font-medium whitespace-nowrap text-fg-2 transition-colors duration-150 hover:text-fg aria-[current=page]:bg-bg-3 aria-[current=page]:text-fg aria-[current=page]:shadow-raised',
			className
		)}
		{...props}
		aria-current={isCurrent ? 'page' : undefined}
	>
		{children}
	</a>
)

/** One tab: a router link, so the board switches without a full reload. */
export const SegmentedTab = createLink(SegmentedTabAnchor)
