import type { ComponentProps } from 'react'

/** The merged mark: a branch joining back into its base, GitHub's merged state. */
export const MergedIcon = (props: Readonly<ComponentProps<'svg'>>) => (
	<svg
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth="1.6"
		viewBox="0 0 16 16"
		{...props}
	>
		<circle cx="4" cy="3" r="1.6" />
		<circle cx="4" cy="13" r="1.6" />
		<circle cx="12" cy="8" r="1.6" />
		<path d="M4 4.6v6.8M4.6 6.2c1.2 1.1 3 1.7 5.8 1.8" />
	</svg>
)
