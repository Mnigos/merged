/**
 * Scoring formula, see docs/decisions/0002-scoring-formula.md:
 * score(author) = Σ per repo min(Σ prWeight × log10(popularity + 10), CAP_PER_REPO × total)
 */

/** Weight of a merged PR by who merged it and where it landed. */
export const PR_WEIGHT = {
	/** merged by someone else */
	merged: 1,
	/** merged by the author themselves (they have write access) */
	selfMerged: 0.5,
	/** PR into a repository owned by the author's own login */
	ownRepo: 0,
} as const satisfies Record<string, number>

export type MergeKind = keyof typeof PR_WEIGHT

/** A single repository may contribute at most this share of an author's total. */
export const CAP_PER_REPO = 0.3

/** Offset that keeps tiny repositories at a weight of about 1. */
export const POPULARITY_OFFSET = 10

export type MergedPrCounts = Readonly<Record<MergeKind, number>>

export interface RepoContribution {
	readonly popularity: number
	readonly prs: MergedPrCounts
}

/** log10 weight of a repository's popularity, about 1 for an unknown repository. */
export const popularityWeight = (popularity: number) =>
	Math.log10(Math.max(0, popularity) + POPULARITY_OFFSET)

/** Uncapped score a single repository contributes to its author. */
export function scoreRepo({ popularity, prs }: RepoContribution) {
	const weightedPrs =
		prs.merged * PR_WEIGHT.merged +
		prs.selfMerged * PR_WEIGHT.selfMerged +
		prs.ownRepo * PR_WEIGHT.ownRepo

	return weightedPrs * popularityWeight(popularity)
}

/** Sums per-repository scores, capping each at CAP_PER_REPO of the uncapped total. */
export function capScore(repoScores: readonly number[]) {
	const total = repoScores.reduce((sum, score) => sum + score, 0)
	const cap = CAP_PER_REPO * total

	return repoScores.reduce((sum, score) => sum + Math.min(score, cap), 0)
}

/** Capped score of an author across all repositories they contributed to. */
export const scoreAuthor = (repos: readonly RepoContribution[]) =>
	capScore(repos.map(scoreRepo))
