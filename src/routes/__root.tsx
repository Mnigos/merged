import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import appCss from '../styles.css?url'

const FONTS_URL =
	'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'merged' },
			{
				name: 'description',
				content:
					'Monthly leaderboard of open source contributors, counted only from pull requests someone else merged.',
			},
			{ name: 'theme-color', content: '#050607' },
		],
		links: [
			{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
			{
				rel: 'preconnect',
				href: 'https://fonts.gstatic.com',
				crossOrigin: 'anonymous',
			},
			{ rel: 'stylesheet', href: FONTS_URL },
			{ rel: 'stylesheet', href: appCss },
		],
	}),
	component: RootComponent,
})

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	)
}

function RootDocument({ children }: Readonly<PropsWithChildren>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>

			<body className="bg-bg font-sans text-fg antialiased">
				{children}

				<Scripts />
			</body>
		</html>
	)
}
