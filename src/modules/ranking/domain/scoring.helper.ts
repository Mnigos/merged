/**
 * Scoring formula, see docs/decisions/0002-scoring-formula.md. Diminishing
 * returns per organisation: the square root is taken over all of an owner's
 * repositories together.
 *
 * repoTerm   = Σ prWeight × count × log10(popularity + 10)²
 * ownerScore = sqrt(Σ repoTerm over the owner's repositories)
 * score      = SCORE_SCALE × Σ ownerScore over owners, rounded to an integer
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

/** Offset that keeps tiny repositories at a weight of about 1. */
export const POPULARITY_OFFSET = 10

/** Points of one merged PR into an unknown repository; one into a 100k-star repository is worth about 5×. */
export const SCORE_SCALE = 100

export type MergedPrCounts = Readonly<Record<MergeKind, number>>

export interface RepoContribution {
	/** `owner/name`, lowercase. */
	readonly repository: string
	readonly popularity: number
	readonly prs: MergedPrCounts
}

/** log10 weight of a repository's popularity, about 1 for an unknown repository. */
export const popularityWeight = (popularity: number) =>
	Math.log10(Math.max(0, popularity) + POPULARITY_OFFSET)

/** Owner (user or organisation) of an `owner/name` repository. */
export const ownerOf = (repository: string) =>
	repository.split('/', 1)[0] ?? repository

/**
 * A repository's term inside its owner's square root: weighted PRs times the
 * squared popularity weight, so a single repository scores
 * sqrt(weighted PRs) × log10(popularity + 10).
 */
export function repoTerm({ popularity, prs }: RepoContribution) {
	const weightedPrs =
		prs.merged * PR_WEIGHT.merged +
		prs.selfMerged * PR_WEIGHT.selfMerged +
		prs.ownRepo * PR_WEIGHT.ownRepo

	return weightedPrs * popularityWeight(popularity) ** 2
}

/** Unscaled score of one owner: the square root of its repositories' terms. */
export const scoreOwner = (repos: readonly RepoContribution[]) =>
	Math.sqrt(repos.reduce((total, repo) => total + repoTerm(repo), 0))

export interface ScoreBreakdown {
	/** Integer score of the author. */
	readonly total: number
	/** Integer share of each repository; the shares sum to `total`. */
	readonly repositories: ReadonlyMap<string, number>
}

interface RepositoryShare {
	readonly repository: string
	readonly share: number
}

function groupByOwner(repos: readonly RepoContribution[]) {
	const owners = new Map<string, RepoContribution[]>()
	for (const repo of repos) {
		const owner = ownerOf(repo.repository)
		const ownerRepos = owners.get(owner)
		if (ownerRepos) ownerRepos.push(repo)
		else owners.set(owner, [repo])
	}

	return owners
}

/** Each repository's scaled share of its owner score: ownerScore × repoTerm / Σ repoTerm. */
function toRepositoryShares(repos: readonly RepoContribution[]) {
	return [...groupByOwner(repos).values()].flatMap(ownerRepos => {
		const terms = ownerRepos.map(repoTerm)
		const ownerTerms = terms.reduce((total, term) => total + term, 0)
		const ownerScore = Math.sqrt(ownerTerms)

		return ownerRepos.map((repo, index) => ({
			repository: repo.repository,
			share:
				ownerTerms === 0
					? 0
					: (SCORE_SCALE * ownerScore * (terms[index] ?? 0)) / ownerTerms,
		}))
	})
}

/**
 * Rounds shares to integers that sum to the rounded total (largest remainder,
 * ties by repository name), so a breakdown never disagrees with its total.
 */
function toIntegerShares(shares: readonly RepositoryShare[]) {
	const total = Math.round(shares.reduce((sum, { share }) => sum + share, 0))
	const floors = new Map(
		shares.map(({ repository, share }) => [repository, Math.floor(share)])
	)
	const leftover =
		total - [...floors.values()].reduce((sum, floor) => sum + floor, 0)
	const byRemainder = shares.toSorted(
		(left, right) =>
			right.share -
				Math.floor(right.share) -
				(left.share - Math.floor(left.share)) ||
			(left.repository < right.repository ? -1 : 1)
	)
	for (const { repository } of byRemainder.slice(0, leftover))
		floors.set(repository, (floors.get(repository) ?? 0) + 1)

	return { total, repositories: floors }
}

/** Integer score of an author and each repository's share of it. */
export const scoreBreakdown = (
	repos: readonly RepoContribution[]
): ScoreBreakdown => toIntegerShares(toRepositoryShares(repos))

/** Integer score of an author across all repositories they contributed to. */
export const scoreAuthor = (repos: readonly RepoContribution[]) =>
	scoreBreakdown(repos).total
