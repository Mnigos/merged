/** Code-unit order of two strings, for stable sorting of logins and repository names. */
export const compareText = (left: string, right: string) =>
	left < right ? -1 : left > right ? 1 : 0

/**
 * Competition ranks ("1224") of items sorted best first: an item tied with the
 * one before it shares its rank, and the next rank skips the tied places.
 */
export function toCompetitionRanks<TItem>(
	sorted: readonly TItem[],
	isTied: (previous: TItem, current: TItem) => boolean
) {
	const ranks: number[] = []
	for (const [index, item] of sorted.entries()) {
		const previous = sorted[index - 1]
		const previousRank = ranks[index - 1]
		ranks.push(
			previous !== undefined &&
				previousRank !== undefined &&
				isTied(previous, item)
				? previousRank
				: index + 1
		)
	}

	return ranks
}

/**
 * Percentile of each score in a list sorted descending: the share of all
 * scores that are strictly lower, 0–100, floored to one decimal so a result
 * is never overstated (the best of 200,000 shows 99.9, not 100).
 */
export function toPercentiles(sortedScores: readonly number[]) {
	const total = sortedScores.length
	const percentiles = Array.from({ length: total }, () => 0)
	let tieGroupEnd = total
	for (let index = total - 1; index >= 0; index--) {
		if (index < total - 1 && sortedScores[index] !== sortedScores[index + 1])
			tieGroupEnd = index + 1
		percentiles[index] = Math.floor(((total - tieGroupEnd) * 1000) / total) / 10
	}

	return percentiles
}
