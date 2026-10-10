import { cn } from '@shared/utils/cn'
import type { ComponentProps, ReactNode } from 'react'

/** Three figures side by side, separated by hairlines. */
export const StatGrid = ({
	className,
	...props
}: Readonly<ComponentProps<'dl'>>) => (
	<dl
		className={cn(
			'grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-line bg-line tabular-nums',
			className
		)}
		{...props}
	/>
)

export interface StatProps {
	readonly label: string
	readonly value: ReactNode
	/** Small trailing text after the value, such as `of 6,853` or `pts`. */
	readonly unit?: ReactNode
}

export const Stat = ({ label, value, unit }: Readonly<StatProps>) => (
	<div className="flex min-w-0 flex-col-reverse justify-end bg-bg-2 px-3 py-2.5">
		<dt className="text-xs text-fg-3">{label}</dt>
		<dd className="text-[1.1875rem] leading-[1.15] font-semibold tracking-[-0.03em] text-fg md:text-xl">
			{value}
			{unit !== undefined && (
				<span className="mt-0.5 block text-xs font-medium tracking-normal whitespace-nowrap text-fg-3 md:ml-1 md:inline md:text-hint">
					{unit}
				</span>
			)}
		</dd>
	</div>
)
