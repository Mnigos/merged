import type { ShardEntry } from '@modules/ranking/domain/files/shard-file'
import { topShareOf } from '@modules/ranking/domain/ranks'

/** Ranks shown as `#n` on a badge; below them the badge shows the top share. */
export const BADGE_RANK_LIMIT = 100

/** Badge color, GitHub's merged purple without the `#`. */
export const BADGE_COLOR = '7c3aed'

/** shields.io endpoint badge, see https://shields.io/badges/endpoint-badge. */
export interface Badge {
	readonly schemaVersion: 1
	readonly label: string
	readonly message: string
	readonly color: string
	readonly namedLogo?: string
	readonly isError?: boolean
}

/** Error badge when no result can be read. */
export const UNAVAILABLE_BADGE = {
	schemaVersion: 1,
	label: 'merged',
	message: 'unavailable',
	color: 'lightgrey',
	isError: true,
} as const satisfies Badge

const SHORT_SEASON_FORMAT = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC',
})
const SHARE_FORMAT = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 1,
})

const toShortSeasonName = (seasonId: string) =>
	SHORT_SEASON_FORMAT.format(new Date(`${seasonId}-01T00:00:00Z`))

function getStanding(entry: ShardEntry | undefined) {
	if (entry?.rank === undefined || entry.rank === null) return 'not ranked'
	if (entry.rank <= BADGE_RANK_LIMIT || entry.percentile === null)
		return `#${entry.rank}`

	return `top ${SHARE_FORMAT.format(topShareOf(entry.percentile))}%`
}

/**
 * README badge of a contributor's season result: `#12 · Oct 2026` in the top
 * 100, `top 3% · Oct 2026` below it, `not ranked · Oct 2026` when excluded or
 * not found.
 */
export const toBadge = (
	seasonId: string,
	entry: ShardEntry | undefined
): Badge => ({
	schemaVersion: 1,
	label: 'merged',
	message: `${getStanding(entry)} · ${toShortSeasonName(seasonId)}`,
	color: BADGE_COLOR,
	namedLogo: 'github',
})
