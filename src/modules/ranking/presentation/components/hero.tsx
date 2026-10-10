import { Page } from '@shared/ui/page'
import { cn } from '@shared/utils/cn'
import type { ReactNode } from 'react'

interface HeroProps {
	readonly children: ReactNode
	/** The card on the right from tablets up. */
	readonly aside: ReactNode
	/**
	 * Puts the card first in the document, so phones, screen readers and
	 * no-JS visitors meet it before the copy; tablets up keep it on the right.
	 */
	readonly leadWithAside?: boolean
}

export const Hero = ({
	children,
	aside,
	leadWithAside = false,
}: Readonly<HeroProps>) => {
	const copy = (
		<div className="min-w-0 md:col-start-1 md:row-start-1">{children}</div>
	)
	const card = (
		<div className="min-w-0 md:col-start-2 md:row-start-1">{aside}</div>
	)

	return (
		<section
			className={cn(
				'relative overflow-hidden pb-9 md:pt-18 md:pb-12',
				leadWithAside ? 'pt-6' : 'pt-12'
			)}
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-50 -right-50 h-130 w-180 bg-[radial-gradient(closest-side,oklch(66%_0.17_300/0.09),transparent_70%)]"
			/>
			<Page className="relative grid gap-7 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-12">
				{leadWithAside ? (
					<>
						{card}
						{copy}
					</>
				) : (
					<>
						{copy}
						{card}
					</>
				)}
			</Page>
		</section>
	)
}
