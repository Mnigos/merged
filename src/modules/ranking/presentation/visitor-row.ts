import type { ContributorOutcome, ContributorRowView } from './leaderboard-view'

/**
 * The visitor's own board row when they are ranked but not among `rows`, so
 * a result page can show where they stand below the top.
 */
export function toVisitorRow(
	outcome: ContributorOutcome,
	rows: readonly ContributorRowView[]
): ContributorRowView | undefined {
	if (outcome.state !== 'ranked') return undefined
	const { contributor } = outcome
	if (
		contributor.rank === null ||
		rows.some(row => row.login === contributor.login)
	)
		return undefined

	return {
		rank: contributor.rank,
		login: contributor.login,
		name: contributor.name,
		location: contributor.location,
		score: contributor.score,
		mergedPullRequests: contributor.mergedPullRequests,
		topRepository: contributor.repositories[0]?.repository ?? null,
		otherRepositories: Math.max(0, contributor.repositories.length - 1),
	}
}
