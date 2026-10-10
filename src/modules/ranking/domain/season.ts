import type { DailyAggregate } from '@modules/ingest/domain/daily-aggregate'
import { isBot } from '@shared/github/bots'
import { isExcludedRepository } from '@shared/github/excluded-repositories'
import {
	githubLoginSchema,
	type GitHubLogin,
} from '@shared/schema/github-login'
import type { IsoDate } from '@shared/schema/iso-date'
import type { SeasonId } from '@shared/schema/season-id'

/** One contributor's merged pull requests into one repository over a season. */
export interface RepositoryContribution {
	readonly merged: number
	readonly selfMerged: number
	/** Numbers of the `merged` pull requests, ascending, so enrichment can resolve who merged them. */
	readonly mergedPullRequests: readonly number[]
}

export interface SeasonContributor {
	readonly login: GitHubLogin
	/** Contributions keyed by lowercase repository name. */
	readonly repositories: ReadonlyMap<string, RepositoryContribution>
}

/** A repository that received at least one merged pull request from outside in the season. */
export interface SeasonRepository {
	readonly repository: string
	/** Distinct outside authors with a merged pull request in the season. */
	readonly contributors: number
	/** Stars (WatchEvents) the repository got in the season. */
	readonly starsInSeason: number
	/** Merged and self-merged pull requests from outside authors. */
	readonly mergedPullRequests: number
}

export interface SeasonTotals {
	/** Merged pull requests of scored contributors, each pull request once. */
	readonly merged: number
	readonly selfMerged: number
	/** As ingested; own-repo merges weigh 0. */
	readonly ownRepo: number
	/** As ingested. */
	readonly stars: number
}

/** Daily aggregates of one season summed per contributor and repository. */
export interface Season {
	readonly seasonId: SeasonId
	readonly daysIncluded: readonly IsoDate[]
	readonly contributors: ReadonlyMap<GitHubLogin, SeasonContributor>
	/**
	 * Logins the bot predicate matches (`isBot` by default). They do not count as repository
	 * contributors, towards standing or totals; they are kept so lookup can
	 * explain the exclusion.
	 */
	readonly bots: ReadonlyMap<GitHubLogin, SeasonContributor>
	readonly repositories: ReadonlyMap<string, SeasonRepository>
	readonly totals: SeasonTotals
}

interface ContributionTally {
	merged: number
	selfMerged: number
	readonly mergedPullRequests: Set<number>
}

interface RepositoryTally {
	readonly authors: Set<GitHubLogin>
	mergedPullRequests: number
}

type ContributionTallies = Map<GitHubLogin, Map<string, ContributionTally>>

function getOrInsert<TKey, TValue>(
	map: Map<TKey, TValue>,
	key: TKey,
	create: () => TValue
) {
	const existing = map.get(key)
	if (existing !== undefined) return existing

	const created = create()
	map.set(key, created)

	return created
}

/** Splits a row's PR numbers into first sightings and repeats of the same repository and number. */
function takeFreshNumbers(seen: Set<number>, numbers: readonly number[]) {
	const fresh: number[] = []
	for (const number of numbers) {
		if (seen.has(number)) continue
		seen.add(number)
		fresh.push(number)
	}

	return { fresh, repeated: numbers.length - fresh.length }
}

const toSeasonContributors = (
	tallies: ContributionTallies
): ReadonlyMap<GitHubLogin, SeasonContributor> =>
	new Map(
		[...tallies].map(([login, repositories]) => [
			login,
			{
				login,
				repositories: new Map(
					[...repositories].map(([repository, tally]) => [
						repository,
						{
							merged: tally.merged,
							selfMerged: tally.selfMerged,
							mergedPullRequests: [...tally.mergedPullRequests].toSorted(
								(left, right) => left - right
							),
						},
					])
				),
			},
		])
	)

interface TotalsTally {
	merged: number
	selfMerged: number
	ownRepo: number
	stars: number
}

interface SeasonAccumulatorInput {
	readonly seasonId: SeasonId
	/** Which lowercase logins are bots; the shared `isBot` rules by default, plus enrichment flags in `BuildSeason`. */
	readonly isBotLogin?: (login: GitHubLogin) => boolean
}

/** A season being summed one daily aggregate at a time, so days need not be held in memory together. */
export interface SeasonAccumulator {
	readonly seasonId: SeasonId
	readonly isBotLogin: (login: GitHubLogin) => boolean
	readonly daysIncluded: IsoDate[]
	readonly contributions: ContributionTallies
	readonly bots: ContributionTallies
	readonly repositoryTallies: Map<string, RepositoryTally>
	readonly seenPullRequests: Map<string, Set<number>>
	readonly stars: Map<string, number>
	readonly totals: TotalsTally
}

/** An empty season to fold daily aggregates into with `addDay`. */
export const createSeasonAccumulator = ({
	seasonId,
	isBotLogin = isBot,
}: SeasonAccumulatorInput): SeasonAccumulator => ({
	seasonId,
	isBotLogin,
	daysIncluded: [],
	contributions: new Map(),
	bots: new Map(),
	repositoryTallies: new Map(),
	seenPullRequests: new Map(),
	stars: new Map(),
	totals: { merged: 0, selfMerged: 0, ownRepo: 0, stars: 0 },
})

/**
 * Adds one daily aggregate to the season. Logins and repository names are
 * lowercased. A repository and pull request number seen again (archive files
 * can repeat events) counts once, the first day added keeping it. Rows of
 * manually excluded repositories are dropped; rows of bots are kept apart and
 * do not count as contributors, for standing or for totals.
 */
export function addDay(accumulator: SeasonAccumulator, day: DailyAggregate) {
	const { totals } = accumulator
	accumulator.daysIncluded.push(day.date)
	totals.ownRepo += day.totals.ownRepo
	totals.stars += day.totals.stars
	for (const row of day.contributions) {
		const repository = row.repository.toLowerCase()
		if (isExcludedRepository(repository)) continue

		const author = githubLoginSchema.make(row.author.toLowerCase())
		const { fresh, repeated } = takeFreshNumbers(
			getOrInsert(accumulator.seenPullRequests, repository, () => new Set()),
			row.mergedPullRequests
		)
		const merged = Math.max(0, row.merged - repeated)
		if (merged + row.selfMerged === 0) continue

		const bot = accumulator.isBotLogin(author)
		const tally = getOrInsert(
			getOrInsert(
				bot ? accumulator.bots : accumulator.contributions,
				author,
				() => new Map<string, ContributionTally>()
			),
			repository,
			() => ({ merged: 0, selfMerged: 0, mergedPullRequests: new Set() })
		)
		tally.merged += merged
		tally.selfMerged += row.selfMerged
		for (const number of fresh) tally.mergedPullRequests.add(number)
		if (bot) continue

		const repositoryTally = getOrInsert(
			accumulator.repositoryTallies,
			repository,
			() => ({ authors: new Set(), mergedPullRequests: 0 })
		)
		repositoryTally.authors.add(author)
		repositoryTally.mergedPullRequests += merged + row.selfMerged
		totals.merged += merged
		totals.selfMerged += row.selfMerged
	}
	for (const repository of day.repositories) {
		const name = repository.repository.toLowerCase()
		accumulator.stars.set(
			name,
			(accumulator.stars.get(name) ?? 0) + repository.stars
		)
	}
}

/**
 * The summed season. A repository's contributors are the distinct outside
 * authors across the season (summing daily `mergeAuthors` would count an
 * author once per day); stars are summed over every day.
 */
export const finishSeason = (accumulator: SeasonAccumulator): Season => ({
	seasonId: accumulator.seasonId,
	daysIncluded: accumulator.daysIncluded.toSorted(),
	contributors: toSeasonContributors(accumulator.contributions),
	bots: toSeasonContributors(accumulator.bots),
	repositories: new Map(
		[...accumulator.repositoryTallies].map(([repository, tally]) => [
			repository,
			{
				repository,
				contributors: tally.authors.size,
				starsInSeason: accumulator.stars.get(repository) ?? 0,
				mergedPullRequests: tally.mergedPullRequests,
			},
		])
	),
	totals: { ...accumulator.totals },
})

interface AssembleSeasonInput extends SeasonAccumulatorInput {
	readonly days: readonly DailyAggregate[]
}

/** Sums the season's daily aggregates in the given order, see `addDay` and `finishSeason`. */
export function assembleSeason({ days, ...input }: AssembleSeasonInput) {
	const accumulator = createSeasonAccumulator(input)
	for (const day of days) addDay(accumulator, day)

	return finishSeason(accumulator)
}
