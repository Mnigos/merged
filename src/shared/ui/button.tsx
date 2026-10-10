import { cn } from '@shared/utils/cn'
import type { ComponentProps } from 'react'

export type ButtonVariant = 'white' | 'ghost'
export type ButtonSize = 'md' | 'sm'

const BUTTON_VARIANT = {
	white: 'border-transparent bg-fg text-bg hover:bg-white',
	ghost: 'border-line-2 text-fg hover:bg-bg-3',
} as const satisfies Record<ButtonVariant, string>

const BUTTON_SIZE = {
	md: 'h-9 px-3.5 text-sm',
	sm: 'h-8 px-3 text-hint',
} as const satisfies Record<ButtonSize, string>

export interface ButtonStyle {
	readonly variant?: ButtonVariant
	readonly size?: ButtonSize
}

/** Classes of a button, for anchors and links that look like one. */
export const buttonClassName = ({
	variant = 'white',
	size = 'md',
}: ButtonStyle = {}) =>
	cn(
		'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border font-semibold whitespace-nowrap transition-[background-color,border-color,transform] duration-150 ease-out select-none active:translate-y-px disabled:cursor-default disabled:opacity-60 [&_svg]:size-3.5',
		BUTTON_VARIANT[variant],
		BUTTON_SIZE[size]
	)

export interface ButtonProps extends ComponentProps<'button'>, ButtonStyle {}

export const Button = ({
	variant,
	size,
	className,
	type = 'button',
	...props
}: Readonly<ButtonProps>) => (
	<button
		className={cn(buttonClassName({ variant, size }), className)}
		// oxlint-disable-next-line react/button-has-type -- defaults to button, callers pass submit
		type={type}
		{...props}
	/>
)
