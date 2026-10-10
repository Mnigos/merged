import { Hero } from '@modules/ranking/presentation/components/hero'
import { HeroLookup } from '@modules/ranking/presentation/components/hero-lookup'
import { HomeLeaderboard } from '@modules/ranking/presentation/components/home-leaderboard'
import { MethodSection } from '@modules/ranking/presentation/components/method-section'
import { NoSeasonMessage } from '@modules/ranking/presentation/components/no-season-message'
import { SeasonCard } from '@modules/ranking/presentation/components/season-card'
import { loadHomeData } from '@modules/ranking/presentation/page-data'
import {
	HOME_SEARCH_DEFAULTS,
	validateHomeSearch,
} from '@modules/ranking/presentation/search-params'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
	validateSearch: validateHomeSearch,
	search: { middlewares: [stripSearchParams(HOME_SEARCH_DEFAULTS)] },
	loaderDeps: ({ search }) => search,
	loader: async ({ deps, parentMatchPromise }) => {
		const { loaderData } = await parentMatchPromise
		const season = loaderData?.season

		return season && loaderData
			? await loadHomeData(season.id, deps, loaderData.renderedAt)
			: null
	},
	staleTime: 5 * 60_000,
	component: HomePage,
})

function HomePage() {
	const data = Route.useLoaderData()
	const search = Route.useSearch()
	if (!data) return <NoSeasonMessage />

	return (
		<>
			<Hero
				aside={
					<SeasonCard
						leaders={data.leaders}
						renderedAt={data.renderedAt}
						season={data.season}
					/>
				}
			>
				<HeroLookup season={data.season} />
			</Hero>
			<HomeLeaderboard
				search={search}
				season={data.season}
				selection={data.selection}
			/>
			<MethodSection />
		</>
	)
}
