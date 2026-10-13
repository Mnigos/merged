interface StandingInput {
	/** Distinct outside contributors with a merged pull request in the season. */
	readonly contributors: number
	/** Stars the repository received in the season, from GH Archive WatchEvents. */
	readonly starsInSeason: number
	/** Real stargazer count from enrichment; `undefined` when not enriched. */
	readonly stars: number | undefined
}

/**
 * Repository standing, the `popularity` input of `repoTerm`. With enrichment it
 * is real stars plus distinct contributors (stars measure reach, contributors
 * measure how open the project is to outside work). Without it (scoring pass 1)
 * the archive proxy is distinct contributors plus stars received in the season,
 * which is small for every repository but still separates active projects from
 * one-person farms.
 */
export const repositoryStanding = ({
	contributors,
	starsInSeason,
	stars,
}: StandingInput) =>
	stars === undefined ? contributors + starsInSeason : stars + contributors
