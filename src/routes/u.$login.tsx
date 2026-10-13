import { ContributorResultCard } from '@modules/ranking/presentation/components/contributor-result.component'
import { HeroLookup } from '@modules/ranking/presentation/components/hero-lookup.component'
import { Hero } from '@modules/ranking/presentation/components/hero.component'
import { ResultLeaderboard } from '@modules/ranking/presentation/components/result-leaderboard.component'
import {
	InvalidLoginMessage,
	NotFoundMessage,
} from '@modules/ranking/presentation/components/route-messages.component'
import { formatSeasonName } from '@modules/ranking/presentation/format.helper'
import { isGitHubLogin } from '@modules/ranking/presentation/lookup-login.helper'
import { loadContributorPageData } from '@modules/ranking/presentation/page-data.helper'
import { toResultHead } from '@modules/ranking/presentation/page-head.helper'
import { ShareActions } from '@modules/share/presentation/components/share-actions.component'
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/u/$login')({
	loader: async ({ params, parentMatchPromise }) => {
		if (!isGitHubLogin(params.login)) throw notFound()
		const { loaderData } = await parentMatchPromise
		const season = loaderData?.season
		if (!season) throw notFound()

		return await loadContributorPageData(season.id, params.login)
	},
	staleTime: 5 * 60_000,
	head: ({ loaderData }) => (loaderData ? toResultHead(loaderData.result) : {}),
	component: ContributorPage,
	notFoundComponent: ContributorNotFound,
})

function ContributorPage() {
	const { result, board, visitorRow } = Route.useLoaderData()
	const { season, outcome } = result
	const login =
		outcome.state === 'notFound' ? outcome.login : outcome.contributor.login

	return (
		<>
			<Hero
				aside={
					<ContributorResultCard
						actions={
							outcome.state === 'ranked' && (
								<ShareActions
									result={{
										mergedPullRequests: outcome.contributor.mergedPullRequests,
										repositories: outcome.contributor.repositories.length,
										seasonName: formatSeasonName(season.id),
										rank: outcome.contributor.rank ?? 0,
										contributors: season.contributors,
										polandRank: outcome.contributor.polandRank,
									}}
									url={result.url}
								/>
							)
						}
						key={login}
						result={result}
					/>
				}
				leadWithAside
			>
				<HeroLookup
					defaultLogin={login}
					headlineAs="h2"
					key={login}
					season={season}
				/>
			</Hero>
			<ResultLeaderboard
				board={board}
				season={season}
				visitorLogin={login}
				visitorRow={visitorRow}
			/>
		</>
	)
}

function ContributorNotFound() {
	const { login } = Route.useParams()

	return isGitHubLogin(login) ? (
		<NotFoundMessage />
	) : (
		<InvalidLoginMessage login={login} />
	)
}
