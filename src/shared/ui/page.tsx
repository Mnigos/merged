import { cn } from '@shared/utils/cn'
import type { ComponentProps } from 'react'

/** The page column: 1120px wide at most, 20px gutters on phones, 32px from tablets up. */
export const Page = ({
	className,
	...props
}: Readonly<ComponentProps<'div'>>) => (
	<div
		className={cn('mx-auto w-full max-w-280 px-5 md:px-8', className)}
		{...props}
	/>
)
