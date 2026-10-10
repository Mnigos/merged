import {
	ErrorMessage,
	NotFoundMessage,
} from '@modules/ranking/presentation/components/route-messages'
import { SiteFrame } from '@modules/ranking/presentation/components/site-frame'
import { getSeasonOverview } from '@modules/ranking/presentation/leaderboard.functions'
import {
	SITE_DESCRIPTION,
	SITE_NAME,
	toPageHead,
	toPageTitle,
} from '@modules/ranking/presentation/page-head'
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import appCss from '../styles.css?url'

const FONTS_URL =
	'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=JetBrains+Mono:wght@400;500&display=swap'

/** Season data changes once a day; loaders refetch at most every five minutes. */
const STALE_TIME = 5 * 60_000

export const Route = createRootRoute({
	loader: async () => await getSeasonOverview(),
	staleTime: STALE_TIME,
	head: () => {
		const page = toPageHead({
			title: toPageTitle('who actually got merged this month'),
			description: SITE_DESCRIPTION,
		})

		return {
			meta: [
				{ charSet: 'utf-8' },
				{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
				...page.meta,
				{ name: 'theme-color', content: '#050607' },
				{ name: 'color-scheme', content: 'dark' },
				{ property: 'og:site_name', content: SITE_NAME },
				{ property: 'og:type', content: 'website' },
				{ name: 'twitter:card', content: 'summary' },
			],
			links: [
				{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
				{
					rel: 'preconnect',
					href: 'https://fonts.gstatic.com',
					crossOrigin: 'anonymous',
				},
				{ rel: 'preconnect', href: 'https://avatars.githubusercontent.com' },
				{ rel: 'stylesheet', href: FONTS_URL },
				{ rel: 'stylesheet', href: appCss },
			],
		}
	},
	shellComponent: RootDocument,
	component: RootLayout,
	notFoundComponent: NotFoundMessage,
	errorComponent: RootError,
})

function RootDocument({ children }: Readonly<PropsWithChildren>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="bg-bg font-sans text-fg">
				{children}
				<Scripts />
			</body>
		</html>
	)
}

function RootLayout() {
	const { season } = Route.useLoaderData()

	return (
		<SiteFrame season={season}>
			<Outlet />
		</SiteFrame>
	)
}

function RootError() {
	return (
		<SiteFrame season={null}>
			<ErrorMessage />
		</SiteFrame>
	)
}
