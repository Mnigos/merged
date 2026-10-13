import type { GitHubLogin } from '@shared/schema/github-login.schema'
import type { SeasonId } from '@shared/schema/season-id.schema'
import type { SeasonEnrichment } from './enrichment.model'
import type { CountryRank, ShardEntry, ShardFile } from './files/shard.file'
import { compareText } from './ranks.helper'
import type {
	ContributorResult,
	ExcludedContributor,
	ScoredSeason,
} from './score-season.helper'

/** Number of shards; a shard key is two lowercase hex characters. */
export const SHARD_COUNT = 128

const SHARD_KEY_MASK = SHARD_COUNT - 1

/** Every shard key, `00` to `7f`. */
export const SHARD_KEYS: readonly string[] = Array.from(
	{ length: SHARD_COUNT },
	(_, index) => index.toString(16).padStart(2, '0')
)

const FNV_OFFSET_BASIS = 0x81_1c_9d_c5
const FNV_PRIME = 0x01_00_01_93
const encoder = new TextEncoder()

/* oxlint-disable no-bitwise -- FNV-1a is defined over 32-bit XOR and multiply */
/**
 * Shard of a login: the low 7 bits of the 32-bit FNV-1a hash of the lowercase
 * login's UTF-8 bytes, as two lowercase hex characters. The website computes
 * the same key to fetch one shard per lookup.
 */
export function shardKeyOf(login: string) {
	let hash = FNV_OFFSET_BASIS
	for (const byte of encoder.encode(login.toLowerCase())) {
		hash ^= byte
		hash = Math.imul(hash, FNV_PRIME) >>> 0
	}

	return (hash & SHARD_KEY_MASK).toString(16).padStart(2, '0')
}
/* oxlint-enable no-bitwise */

interface ShardEntryInput {
	readonly contributor: ContributorResult
	readonly rank: number | null
	readonly percentile: number | null
	readonly excluded: ExcludedContributor['exclusion'] | null
	readonly countryRanks: ReadonlyMap<GitHubLogin, CountryRank>
	readonly enrichment: SeasonEnrichment
}

function toShardEntry({
	contributor,
	rank,
	percentile,
	excluded,
	countryRanks,
	enrichment,
}: ShardEntryInput): ShardEntry {
	const profile = enrichment.contributors.get(contributor.login)

	return {
		login: contributor.login,
		rank,
		percentile,
		score: contributor.score,
		mergedPullRequests: contributor.merged,
		selfMergedPullRequests: contributor.selfMerged,
		boards: { country: countryRanks.get(contributor.login) ?? null },
		repositories: contributor.repositories.map(repository => ({
			repository: repository.repository,
			mergedPullRequests: repository.merged,
			selfMergedPullRequests: repository.selfMerged,
			standing: repository.standing,
			counted: repository.counted,
			score: repository.score,
		})),
		name: profile?.name ?? null,
		location: profile?.location ?? null,
		excluded,
	}
}

export interface ShardsInput {
	readonly seasonId: SeasonId
	readonly scored: ScoredSeason
	readonly countryRanks: ReadonlyMap<GitHubLogin, CountryRank>
	readonly enrichment: SeasonEnrichment
	readonly computedAt: string
}

/**
 * Every one of the 128 shard files, empty ones included, keyed by shard key.
 * Ranked and excluded contributors both get an entry; entries are in login order.
 */
export function buildShards({
	seasonId,
	scored,
	countryRanks,
	enrichment,
	computedAt,
}: ShardsInput): ReadonlyMap<string, ShardFile> {
	const entries = new Map<string, ShardEntry[]>(
		SHARD_KEYS.map(key => [key, []])
	)
	const add = (entry: ShardEntry) =>
		entries.get(shardKeyOf(entry.login))?.push(entry)
	const shared = { countryRanks, enrichment }

	for (const contributor of scored.ranked)
		add(
			toShardEntry({
				...shared,
				contributor,
				rank: contributor.rank,
				percentile: contributor.percentile,
				excluded: null,
			})
		)
	for (const contributor of scored.excluded)
		add(
			toShardEntry({
				...shared,
				contributor,
				rank: null,
				percentile: null,
				excluded: contributor.exclusion,
			})
		)

	return new Map(
		[...entries].map(([key, shardEntries]) => [
			key,
			{
				season: seasonId,
				computedAt,
				entries: Object.fromEntries(
					shardEntries
						.toSorted((left, right) => compareText(left.login, right.login))
						.map(entry => [entry.login, entry])
				),
			},
		])
	)
}
