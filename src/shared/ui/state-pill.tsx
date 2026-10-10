import { cn } from '@shared/utils/cn'
import type { ComponentProps } from 'react'

export type StatePillTone = 'merged' | 'neutral'

const STATE_PILL_TONE = {
	merged: 'bg-merged text-white',
	neutral: 'border border-line-2 bg-bg-3 text-fg-2',
} as const satisfies Record<StatePillTone, string>

export interface StatePillProps extends ComponentProps<'span'> {
	readonly tone?: StatePillTone
}

/** A pull request state badge in GitHub's vocabulary: an icon and one word. */
export const StatePill = ({
	tone = 'merged',
	className,
	...props
}: Readonly<StatePillProps>) => (
	<span
		className={cn(
			'inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-hint font-semibold [&_svg]:size-3.5',
			STATE_PILL_TONE[tone],
			className
		)}
		{...props}
	/>
)
