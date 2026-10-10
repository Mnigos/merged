import type { ReactNode } from 'react'
import { Page } from './page'

interface PageMessageProps {
	readonly title: ReactNode
	readonly children: ReactNode
	/** Links or buttons under the message. */
	readonly actions: ReactNode
}

/** A calm full-page message for not found and error states. */
export const PageMessage = ({
	title,
	children,
	actions,
}: Readonly<PageMessageProps>) => (
	<section className="pt-20 pb-24 md:pt-28 md:pb-32">
		<Page>
			<div className="max-w-[46ch]">
				<h1 className="text-title font-semibold text-balance md:text-[1.75rem] md:leading-[1.15]">
					{title}
				</h1>
				<div className="mt-3 text-body text-pretty text-fg-2 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-fg">
					{children}
				</div>
				<div className="mt-6 flex flex-wrap gap-2">{actions}</div>
			</div>
		</Page>
	</section>
)
