import {
	parseSearch,
	stringifySearch,
} from '@modules/ranking/presentation/router-search'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: 'intent',
		parseSearch,
		stringifySearch,
	})
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
