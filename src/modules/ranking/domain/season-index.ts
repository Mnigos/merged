import { isoDateSchema, type IsoDate } from '@shared/schema/iso-date'
import {
	daysInMonth,
	daysInSeason,
	seasonEndsAt,
	type SeasonId,
} from '@shared/schema/season-id'
import type {
	SeasonIndex,
	SeasonIndexEntry,
	SeasonStatus,
} from './files/season-index-file'
import type { ScoredSeason } from './score-season'
import type { Season } from './season'

interface SeasonClockInput {
	readonly seasonId: SeasonId
	readonly daysIncluded: readonly IsoDate[]
	readonly now: Date
}

/** Final once every day of the month is included and the month is over in UTC. */
export function seasonStatus({
	seasonId,
	daysIncluded,
	now,
}: SeasonClockInput): SeasonStatus {
	const complete = new Set(daysIncluded).size === daysInMonth(seasonId)

	return complete && now >= seasonEndsAt(seasonId) ? 'final' : 'provisional'
}

/**
 * Days of the season that are already over (before `now`'s UTC day) without
 * a daily aggregate. Today and later days are not missing yet.
 */
export function missingDays({ seasonId, daysIncluded, now }: SeasonClockInput) {
	const included = new Set(daysIncluded)
	const today = isoDateSchema.make(now.toISOString().slice(0, 10))

	return daysInSeason(seasonId).filter(day => day < today && !included.has(day))
}

interface SeasonIndexEntryInput {
	readonly season: Season
	readonly scored: ScoredSeason
	readonly now: Date
}

/** The index entry describing a freshly computed season. */
export function toSeasonIndexEntry({
	season,
	scored,
	now,
}: SeasonIndexEntryInput): SeasonIndexEntry {
	const clock = {
		seasonId: season.seasonId,
		daysIncluded: season.daysIncluded,
		now,
	}

	return {
		id: season.seasonId,
		status: seasonStatus(clock),
		daysIncluded: season.daysIncluded.length,
		daysInMonth: daysInMonth(season.seasonId),
		missingDays: missingDays(clock),
		computedAt: now.toISOString(),
		contributors: scored.ranked.length,
		repositories: season.repositories.size,
		mergedPullRequests: season.totals.merged + season.totals.selfMerged,
	}
}

/**
 * Replaces or adds a season in the index, keeps every other season, orders
 * seasons newest first and points `latest` at the newest.
 */
export function upsertSeasonIndex(
	index: SeasonIndex | undefined,
	entry: SeasonIndexEntry
): SeasonIndex {
	const seasons = [
		...(index?.seasons ?? []).filter(season => season.id !== entry.id),
		entry,
	].toSorted((left, right) => (left.id < right.id ? 1 : -1))

	return { latest: seasons[0]?.id ?? null, seasons }
}
