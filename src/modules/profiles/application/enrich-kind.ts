import { MAX_BATCH_SIZE } from '@shared/github/graphql-batch'
import type { StoredFile } from '@shared/storage/json-storage.port'
import { Array, Effect, Semaphore } from 'effect'
import type { ProfileSourceError } from './profile-source.error'
import type { FetchedBatch } from './profile-source.port'
import type { ProfileStoreError } from './profile-store.error'

/** Batches of one kind in flight at the same time; one, since GitHub's secondary rate limit already triggers about every 50 sequential queries. */
export const BATCH_CONCURRENCY = 1

/** A kind's file is written after this many batches, so an interrupted run keeps its progress. */
export const PERSIST_EVERY_BATCHES = 10

/** What enrichment did for one kind (repositories, contributors or pull requests). */
export interface EnrichKindReport {
	/** Targets after the limit. */
	readonly requested: number
	/** Targets with a fresh entry that were not fetched. */
	readonly cached: number
	/** Entries fetched in this run, missing ones included. */
	readonly fetched: number
	/** Fetched entries GitHub did not find (for pull requests: merger unknown). */
	readonly missing: number
	/** Targets GitHub answered with another error; left for the next run. */
	readonly failed: number
	readonly queries: number
	readonly cost: number
	/** Points left after the last query, when one ran. */
	readonly remaining: number | undefined
	/** Size of the kind's file after the final write. */
	readonly fileBytes: number
	readonly writes: number
	readonly bytesWritten: number
}

export interface EnrichKindInput<TTarget, TEntry> {
	readonly targets: readonly TTarget[]
	readonly keyOf: (target: TTarget) => string
	readonly entryKeyOf: (entry: TEntry) => string
	/** Entries of the existing file; kept unless refetched. */
	readonly cached: Readonly<Record<string, TEntry>>
	readonly isFresh: (entry: TEntry) => boolean
	readonly isMissing: (entry: TEntry) => boolean
	readonly fetch: (
		batch: readonly TTarget[]
	) => Effect.Effect<FetchedBatch<TEntry>, ProfileSourceError>
	readonly save: (
		entries: Readonly<Record<string, TEntry>>
	) => Effect.Effect<StoredFile, ProfileStoreError>
}

/**
 * Enriches one kind: keeps fresh cached entries, fetches the rest in batches
 * of `MAX_BATCH_SIZE`, merges results into the cached entries, writes the file
 * every `PERSIST_EVERY_BATCHES` batches and once at the end.
 */
export function enrichKind<TTarget, TEntry>({
	targets,
	keyOf,
	entryKeyOf,
	cached,
	isFresh,
	isMissing,
	fetch,
	save,
}: EnrichKindInput<TTarget, TEntry>) {
	return Effect.gen(function* () {
		const entries = new Map(Object.entries(cached))
		const stale = targets.filter(target => {
			const entry = entries.get(keyOf(target))

			return entry === undefined || !isFresh(entry)
		})
		const tally = {
			fetched: 0,
			missing: 0,
			failed: 0,
			queries: 0,
			cost: 0,
			remaining: undefined as number | undefined,
			writes: 0,
			bytesWritten: 0,
			fileBytes: 0,
		}
		const writeLock = yield* Semaphore.make(1)
		const persist = writeLock.withPermits(1)(
			Effect.suspend(() => save(Object.fromEntries(entries))).pipe(
				Effect.tap(stored =>
					Effect.sync(() => {
						tally.writes++
						tally.bytesWritten += stored.bytes
						tally.fileBytes = stored.bytes
					})
				)
			)
		)
		let batchesDone = 0

		yield* Effect.forEach(
			Array.chunksOf(stale, MAX_BATCH_SIZE),
			batch =>
				Effect.gen(function* () {
					const result = yield* fetch(batch)
					for (const entry of result.profiles) {
						entries.set(entryKeyOf(entry), entry)
						if (isMissing(entry)) tally.missing++
					}
					tally.fetched += result.profiles.length
					tally.failed += result.failed
					tally.queries++
					tally.cost += result.cost
					tally.remaining = result.remaining ?? tally.remaining
					batchesDone++
					if (batchesDone % PERSIST_EVERY_BATCHES === 0) yield* persist
				}),
			{ concurrency: BATCH_CONCURRENCY, discard: true }
		)
		yield* persist

		return {
			requested: targets.length,
			cached: targets.length - stale.length,
			...tally,
		} satisfies EnrichKindReport
	})
}
