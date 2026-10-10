import type { MergeResolution } from './merge-resolution'

/** Days a fetched profile stays valid before enrichment fetches it again. */
export const DEFAULT_MAX_AGE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** True when something fetched at `fetchedAt` is younger than `maxAgeDays` at `nowMs`. */
export const isFresh = (
	fetchedAt: string,
	nowMs: number,
	maxAgeDays: number = DEFAULT_MAX_AGE_DAYS
) => nowMs - Date.parse(fetchedAt) < maxAgeDays * DAY_MS

/**
 * True when a merge resolution needs no refetch: a known merger never changes,
 * an unknown one is retried only once it is older than `maxAgeDays`.
 */
export const isSettledMerge = (
	resolution: MergeResolution,
	nowMs: number,
	maxAgeDays: number = DEFAULT_MAX_AGE_DAYS
) =>
	resolution.mergedBy !== null ||
	isFresh(resolution.fetchedAt, nowMs, maxAgeDays)
