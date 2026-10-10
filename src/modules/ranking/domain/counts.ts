/** Other outside contributors a repository needs in the season to count. */
export const MIN_OTHER_CONTRIBUTORS = 1

/** Stars a repository needs in the season to count. */
export const MIN_STARS_IN_SEASON = 3

/** Real stars (from enrichment) a repository needs to count. */
export const MIN_REAL_STARS = 10

interface CountsInput {
	/** Distinct outside contributors in the season, the author included. */
	readonly contributors: number
	readonly starsInSeason: number
	/** Real stargazer count from enrichment; `undefined` when not enriched. */
	readonly stars: number | undefined
}

/**
 * Whether a repository counts towards a contributor's score. A repository
 * counts once someone besides you contributed to it or starred it this season,
 * or it has at least 10 stars: another outside contributor merged into it, it
 * got at least `MIN_STARS_IN_SEASON` stars in the season, or enrichment reports
 * at least `MIN_REAL_STARS` stars. Repositories nobody else cares about cannot
 * be farmed. Once every repository is enriched this converges to real stars.
 */
export const repositoryCounts = ({
	contributors,
	starsInSeason,
	stars,
}: CountsInput) =>
	contributors - 1 >= MIN_OTHER_CONTRIBUTORS ||
	starsInSeason >= MIN_STARS_IN_SEASON ||
	(stars ?? 0) >= MIN_REAL_STARS
