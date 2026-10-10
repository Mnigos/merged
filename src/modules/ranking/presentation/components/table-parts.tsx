import { cn } from '@shared/utils/cn'
import type { ComponentProps } from 'react'

/** The rounded panel a board's table and its footer link sit in. */
export const TablePanel = ({
	className,
	...props
}: Readonly<ComponentProps<'div'>>) => (
	<div
		className={cn(
			'overflow-hidden rounded-xl border border-line bg-bg-2',
			className
		)}
		{...props}
	/>
)

export const Table = ({
	className,
	...props
}: Readonly<ComponentProps<'table'>>) => (
	<table
		className={cn('w-full border-separate border-spacing-0', className)}
		{...props}
	/>
)

export const HeaderCell = ({
	className,
	...props
}: Readonly<ComponentProps<'th'>>) => (
	<th
		className={cn(
			'border-b border-line px-3 py-2.5 text-left text-xs font-medium text-fg-3',
			className
		)}
		scope="col"
		{...props}
	/>
)

export interface RowProps extends ComponentProps<'tr'> {
	/** The visitor's own row: tinted, with the accent bar. */
	readonly isVisitor?: boolean
	/** Set apart from the rows above by a gap, for a row out of sequence. */
	readonly isDetached?: boolean
}

export const Row = ({
	isVisitor,
	isDetached,
	className,
	...props
}: Readonly<RowProps>) => (
	<tr
		className={cn(
			'[&>td]:border-b [&>td]:border-line [&>td]:transition-colors [&>td]:duration-100 last:[&>td]:border-b-0',
			isDetached && '[&>td]:border-t-8 [&>td]:border-t-bg',
			isVisitor
				? '[&>td]:bg-merged-soft [&>td:first-child]:shadow-you'
				: 'hover:[&>td]:bg-bg-3',
			className
		)}
		{...props}
	/>
)

export const Cell = ({
	className,
	...props
}: Readonly<ComponentProps<'td'>>) => (
	<td
		className={cn('px-3 py-2.75 align-middle text-sm', className)}
		{...props}
	/>
)

/** Right-aligned figure with tabular numerals. */
export const NumberCell = ({
	className,
	...props
}: Readonly<ComponentProps<'td'>>) => (
	<Cell
		className={cn('text-right whitespace-nowrap tabular-nums', className)}
		{...props}
	/>
)

interface RankCellProps {
	readonly rank: number
}

export const RankCell = ({ rank }: Readonly<RankCellProps>) => (
	<Cell
		className={cn(
			'w-11 pr-1 text-right font-medium tabular-nums',
			rank <= 3 ? 'text-fg' : 'text-fg-3'
		)}
	>
		{rank}
	</Cell>
)

/** Shown on phones only from the `md` breakpoint up. */
export const DESKTOP_ONLY = 'hidden md:table-cell'
