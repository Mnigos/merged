import {
	githubLoginSchema,
	type GitHubLogin,
} from '@shared/schema/github-login.schema'
import { isoDateSchema, type IsoDate } from '@shared/schema/iso-date.schema'
import { Result, Schema } from 'effect'
import { DailyAggregateMergeError } from './daily-aggregate.error'
import type { MergeEvent } from './merge-event.model'
import type { StarEvent } from './star-event.model'

const countSchema = Schema.Int.pipe(
	Schema.check(Schema.isGreaterThanOrEqualTo(0))
)

/** Merges of one contributor into a repository they do not own; logins and names are lowercase. */
export const contributionRowSchema = Schema.Struct({
	author: githubLoginSchema,
	repository: Schema.String,
	merged: countSchema,
	selfMerged: countSchema,
	/** Numbers of the `merged` pull requests, so pass 2 can look up who merged them. */
	mergedPullRequests: Schema.Array(Schema.Int),
})
export type ContributionRow = typeof contributionRowSchema.Type

/** Stars and distinct merge authors other than the owner, for one repository. */
export const repositoryDaySchema = Schema.Struct({
	repository: Schema.String,
	stars: countSchema,
	mergeAuthors: countSchema,
})
export type RepositoryDay = typeof repositoryDaySchema.Type

export const dayTotalsSchema = Schema.Struct({
	merged: countSchema,
	selfMerged: countSchema,
	ownRepo: countSchema,
	stars: countSchema,
})
export type DayTotals = typeof dayTotalsSchema.Type

/** One UTC day of merged pull requests and stars, stored as `days/<date>.json`. */
export const dailyAggregateSchema = Schema.Struct({
	date: isoDateSchema,
	totals: dayTotalsSchema,
	contributions: Schema.Array(contributionRowSchema),
	/** Own-repo merges per lowercase login; they weigh 0, so they get no rows. */
	ownRepoMerges: Schema.Record(Schema.String, countSchema),
	repositories: Schema.Array(repositoryDaySchema),
})
export type DailyAggregate = typeof dailyAggregateSchema.Type

interface DayEvents {
	readonly date: IsoDate
	readonly merges: readonly MergeEvent[]
	readonly stars: readonly StarEvent[]
}

interface ContributionTally {
	readonly author: GitHubLogin
	readonly repository: string
	merged: number
	selfMerged: number
	mergedPullRequests: number[]
}

interface RepositoryTally {
	stars: number
	readonly authors: Set<string>
}

interface DayTally {
	readonly totals: { -readonly [TKey in keyof DayTotals]: number }
	readonly contributions: Map<string, ContributionTally>
	readonly ownRepoMerges: Map<string, number>
	readonly repositories: Map<string, RepositoryTally>
}

function getOrInsert<TValue>(
	map: Map<string, TValue>,
	key: string,
	create: () => TValue
) {
	const existing = map.get(key)
	if (existing !== undefined) return existing

	const created = create()
	map.set(key, created)

	return created
}

const compareText = (left: string, right: string) =>
	left < right ? -1 : left > right ? 1 : 0

const byRepositoryThenAuthor = (
	left: ContributionRow,
	right: ContributionRow
) =>
	compareText(left.repository, right.repository) ||
	compareText(left.author, right.author)

const toLoginKey = (login: GitHubLogin) =>
	githubLoginSchema.make(login.toLowerCase())

const createDayTally = (): DayTally => ({
	totals: { merged: 0, selfMerged: 0, ownRepo: 0, stars: 0 },
	contributions: new Map(),
	ownRepoMerges: new Map(),
	repositories: new Map(),
})

const getRepositoryTally = (tally: DayTally, repository: string) =>
	getOrInsert(tally.repositories, repository, () => ({
		stars: 0,
		authors: new Set(),
	}))

const getContributionTally = (
	tally: DayTally,
	author: GitHubLogin,
	repository: string
) =>
	getOrInsert(tally.contributions, `${repository}\u0000${author}`, () => ({
		author,
		repository,
		merged: 0,
		selfMerged: 0,
		mergedPullRequests: [],
	}))

const addOwnRepoMerges = (tally: DayTally, author: string, count: number) =>
	tally.ownRepoMerges.set(
		author,
		(tally.ownRepoMerges.get(author) ?? 0) + count
	)

function toDailyAggregate(date: IsoDate, tally: DayTally): DailyAggregate {
	return {
		date,
		totals: tally.totals,
		contributions: [...tally.contributions.values()]
			.map(row => ({
				...row,
				mergedPullRequests: row.mergedPullRequests.toSorted(
					(left, right) => left - right
				),
			}))
			.toSorted(byRepositoryThenAuthor),
		ownRepoMerges: Object.fromEntries(
			[...tally.ownRepoMerges.entries()].toSorted(([left], [right]) =>
				compareText(left, right)
			)
		),
		repositories: [...tally.repositories.entries()]
			.map(([repository, repositoryTally]) => ({
				repository,
				stars: repositoryTally.stars,
				mergeAuthors: repositoryTally.authors.size,
			}))
			.toSorted((left, right) =>
				compareText(left.repository, right.repository)
			),
	}
}

/**
 * Rolls a day's merge and star events up into its daily aggregate. Logins and
 * repository names are compared lowercase; own-repo merges only count per author.
 */
export function aggregateDay({
	date,
	merges,
	stars,
}: DayEvents): DailyAggregate {
	const tally = createDayTally()
	tally.totals.stars = stars.length

	for (const merge of merges) {
		tally.totals[merge.mergeKind]++
		const author = toLoginKey(merge.author)
		if (merge.mergeKind === 'ownRepo') {
			addOwnRepoMerges(tally, author, 1)
			continue
		}

		const repository = merge.repository.toLowerCase()
		const row = getContributionTally(tally, author, repository)
		row[merge.mergeKind]++
		if (merge.mergeKind === 'merged') row.mergedPullRequests.push(merge.number)
		getRepositoryTally(tally, repository).authors.add(author)
	}
	for (const star of stars)
		getRepositoryTally(tally, star.repository.toLowerCase()).stars++

	return toDailyAggregate(date, tally)
}

function addPart(tally: DayTally, part: DailyAggregate) {
	tally.totals.merged += part.totals.merged
	tally.totals.selfMerged += part.totals.selfMerged
	tally.totals.ownRepo += part.totals.ownRepo
	tally.totals.stars += part.totals.stars
	for (const row of part.contributions) {
		const contribution = getContributionTally(tally, row.author, row.repository)
		contribution.merged += row.merged
		contribution.selfMerged += row.selfMerged
		contribution.mergedPullRequests.push(...row.mergedPullRequests)
		getRepositoryTally(tally, row.repository).authors.add(row.author)
	}
	for (const [author, count] of Object.entries(part.ownRepoMerges))
		addOwnRepoMerges(tally, author, count)
	for (const repository of part.repositories)
		getRepositoryTally(tally, repository.repository).stars += repository.stars
}

function dropRepeatedPullRequests(tally: DayTally) {
	for (const row of tally.contributions.values()) {
		const unique = [...new Set(row.mergedPullRequests)]
		const repeated = row.mergedPullRequests.length - unique.length
		row.mergedPullRequests = unique
		row.merged -= repeated
		tally.totals.merged -= repeated
	}
}

/**
 * Merges daily aggregates of the same day built from disjoint sets of hours
 * (day parts) into the aggregate of the whole day: rows, own-repo merges,
 * stars and totals are summed, merge authors are recounted from the merged
 * rows, and a pull request number repeated in a row counts once, as ranking
 * counts it. Fails without parts or when the parts are of different days.
 */
export function mergeDailyAggregates(
	parts: readonly DailyAggregate[]
): Result.Result<DailyAggregate, DailyAggregateMergeError> {
	const [first] = parts
	if (first === undefined)
		return Result.fail(
			new DailyAggregateMergeError({
				dates: [],
				message: 'No daily aggregate parts to merge',
			})
		)

	const dates = [...new Set(parts.map(part => part.date))]
	if (dates.length > 1)
		return Result.fail(
			new DailyAggregateMergeError({
				dates,
				message: `Daily aggregate parts are of different days: ${dates.join(', ')}`,
			})
		)

	const tally = createDayTally()
	for (const part of parts) addPart(tally, part)
	dropRepeatedPullRequests(tally)

	return Result.succeed(toDailyAggregate(first.date, tally))
}
