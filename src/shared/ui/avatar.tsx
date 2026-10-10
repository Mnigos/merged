import { cn } from '@shared/utils/cn'
import type { ComponentProps } from 'react'

export interface AvatarProps extends Omit<
	ComponentProps<'img'>,
	'src' | 'alt'
> {
	readonly login: string
	/** Rendered size in CSS pixels; the image is fetched at twice that. */
	readonly size?: number
}

/** A GitHub account's avatar in a bordered circle; decorative, the login is always next to it. */
export const Avatar = ({
	login,
	size = 28,
	className,
	...props
}: Readonly<AvatarProps>) => (
	<img
		alt=""
		className={cn(
			'shrink-0 rounded-full border border-line-2 bg-bg-3',
			className
		)}
		decoding="async"
		height={size}
		loading="lazy"
		src={`https://avatars.githubusercontent.com/${encodeURIComponent(login)}?size=${size * 2}`}
		width={size}
		{...props}
	/>
)
