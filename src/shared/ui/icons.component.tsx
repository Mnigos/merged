import type { ComponentProps } from 'react'

type IconProps = Readonly<ComponentProps<'svg'>>

const STROKE = {
	fill: 'none',
	stroke: 'currentColor',
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
	strokeWidth: 1.6,
	viewBox: '0 0 16 16',
} as const satisfies ComponentProps<'svg'>

export const SearchIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} strokeWidth={1.7} {...props}>
		<circle cx="7.25" cy="7.25" r="4.75" />
		<path d="m13.5 13.5-2.75-2.75" />
	</svg>
)

export const XLogoIcon = (props: IconProps) => (
	<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
		<path d="M18.9 2H22l-7.6 8.7L23 22h-7l-5.5-7.2L4.2 22H1l8.2-9.4L1 2h7.2l5 6.6L18.9 2zm-1.2 18h1.9L7.4 3.9H5.3L17.7 20z" />
	</svg>
)

export const LinkIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} {...props}>
		<path d="M6.5 9.5 9.5 6.5" />
		<path d="M7.25 4.25 8.5 3a2.83 2.83 0 0 1 4 4l-1.25 1.25" />
		<path d="M8.75 11.75 7.5 13a2.83 2.83 0 0 1-4-4l1.25-1.25" />
	</svg>
)

export const CheckIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} strokeWidth={1.8} {...props}>
		<path d="m3.5 8.5 3 3 6-7" />
	</svg>
)

export const ChevronIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} {...props}>
		<path d="m6 4 4 4-4 4" />
	</svg>
)

export const ArrowUpRightIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} {...props}>
		<path d="M5 11 11 5M6 5h5v5" />
	</svg>
)

/** Half-filled circle: something still in progress. */
export const ProgressIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} {...props}>
		<circle cx="8" cy="8" r="5.5" />
		<path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
	</svg>
)

/** Circle with a slash: excluded or not counted. */
export const SkipIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} {...props}>
		<circle cx="8" cy="8" r="5.5" />
		<path d="m4.2 11.8 7.6-7.6" />
	</svg>
)

/** Dashed circle: nothing there yet. */
export const EmptyCircleIcon = (props: IconProps) => (
	<svg aria-hidden="true" {...STROKE} strokeDasharray="2.2 2.1" {...props}>
		<circle cx="8" cy="8" r="5.5" />
	</svg>
)
