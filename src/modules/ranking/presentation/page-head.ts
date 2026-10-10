import {
	formatCount,
	formatNumber,
	formatSeasonName,
	formatTimes,
	formatTopPercent,
} from './format'
import type { ContributorResult } from './leaderboard-view'

/** Name of the site in titles and link previews. */
export const SITE_NAME = 'merged'

export const SITE_DESCRIPTION =
	"Monthly ranking of open source contributors, built from pull requests merged into repositories they don't own. Bots and own repos count for nothing; self-merges count half."

interface PageHeadInput {
	readonly title: string
	readonly description: string
}

/** Title, description and their text-only link preview tags. */
export const toPageHead = ({ title, description }: PageHeadInput) => ({
	meta: [
		{ title },
		{ name: 'description', content: description },
		{ property: 'og:title', content: title },
		{ property: 'og:description', content: description },
		{ name: 'twitter:title', content: title },
		{ name: 'twitter:description', content: description },
	],
})

/** `<page> · merged`. */
export const toPageTitle = (page: string) => `${page} · ${SITE_NAME}`

/** Title and description of a lookup result for each outcome. */
export function toResultHead({ season, outcome }: ContributorResult) {
	const seasonName = formatSeasonName(season.id)
	if (outcome.state === 'notFound')
		return toPageHead({
			title: toPageTitle(`${outcome.login} in ${seasonName}`),
			description: `No merged pull requests into other people's repositories for ${outcome.login} in ${seasonName} yet.`,
		})

	const { contributor } = outcome
	const merged = `${contributor.login} got merged ${formatTimes(contributor.mergedPullRequests)} into ${formatCount(contributor.repositories.length, 'repository', 'repositories')} in ${seasonName}`
	if (outcome.state === 'bot')
		return toPageHead({
			title: toPageTitle(`${contributor.login} in ${seasonName}`),
			description: `${contributor.login} is excluded as a bot.`,
		})
	if (outcome.state === 'noCountedRepository')
		return toPageHead({
			title: toPageTitle(`${contributor.login} in ${seasonName}`),
			description: `${merged}, but none of those repositories counts yet.`,
		})

	const rank = `#${formatNumber(contributor.rank ?? 0)} of ${formatNumber(season.contributors)}`

	return toPageHead({
		title: toPageTitle(`${contributor.login}, ${rank} in ${seasonName}`),
		description: `${merged}: ${rank}, top ${formatTopPercent(contributor.percentile ?? 0)}, ${formatNumber(contributor.score)} points.`,
	})
}
