import { cn } from '@shared/utils/cn'
import type { ComponentProps } from 'react'

export const Kbd = ({
	className,
	...props
}: Readonly<ComponentProps<'kbd'>>) => (
	<kbd
		className={cn(
			'rounded border border-line bg-bg px-1.5 py-px font-mono text-[0.71875rem] leading-normal font-medium text-fg-3',
			className
		)}
		{...props}
	/>
)
