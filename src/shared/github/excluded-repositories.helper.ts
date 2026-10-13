/**
 * Owners whose repositories never count, lowercase: demo and test setups where
 * many accounts merge generated pull requests, such as trunk.io's merge queue
 * demo (`merge-demo`).
 */
export const EXCLUDED_REPOSITORY_OWNERS: ReadonlySet<string> = new Set([
	'merge-demo',
])

/**
 * True for an `owner/name` repository on the manual exclusion list, compared
 * lowercase. Its pull requests are dropped from scoring, standing and totals.
 */
export function isExcludedRepository(repository: string) {
	const [owner = ''] = repository.toLowerCase().split('/', 1)

	return EXCLUDED_REPOSITORY_OWNERS.has(owner)
}
