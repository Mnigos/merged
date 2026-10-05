import {
	githubLoginSchema,
	type GitHubLogin,
} from '@shared/schema/github-login'
import { isoDateSchema, type IsoDate } from '@shared/schema/iso-date'
import { Schema } from 'effect'
import type { MergeEvent } from './merge-event'
import type { StarEvent } from './star-event'

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
	readonly mergedPullRequests: number[]
}

interface RepositoryTally {
	stars: number
	readonly authors: Set<string>
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

/**
 * Rolls a day's merge and star events up into its daily aggregate. Logins and
 * repository names are compared lowercase; own-repo merges only count per author.
 */
export function aggregateDay({
	date,
	merges,
	stars,
}: DayEvents): DailyAggregate {
	const totals = { merged: 0, selfMerged: 0, ownRepo: 0, stars: stars.length }
	const contributions = new Map<string, ContributionTally>()
	const ownRepoMerges = new Map<string, number>()
	const repositories = new Map<string, RepositoryTally>()
	const getRepository = (repository: string) =>
		getOrInsert(repositories, repository, () => ({
			stars: 0,
			authors: new Set(),
		}))

	for (const merge of merges) {
		totals[merge.mergeKind]++
		const author = toLoginKey(merge.author)
		if (merge.mergeKind === 'ownRepo') {
			ownRepoMerges.set(author, (ownRepoMerges.get(author) ?? 0) + 1)
			continue
		}

		const repository = merge.repository.toLowerCase()
		const row = getOrInsert(
			contributions,
			`${repository}\u0000${author}`,
			() => ({
				author,
				repository,
				merged: 0,
				selfMerged: 0,
				mergedPullRequests: [],
			})
		)
		row[merge.mergeKind]++
		if (merge.mergeKind === 'merged') row.mergedPullRequests.push(merge.number)
		getRepository(repository).authors.add(author)
	}
	for (const star of stars) getRepository(star.repository.toLowerCase()).stars++

	return {
		date,
		totals,
		contributions: [...contributions.values()]
			.map(row => ({
				...row,
				mergedPullRequests: row.mergedPullRequests.toSorted(
					(left, right) => left - right
				),
			}))
			.toSorted(byRepositoryThenAuthor),
		ownRepoMerges: Object.fromEntries(
			[...ownRepoMerges.entries()].toSorted(([left], [right]) =>
				compareText(left, right)
			)
		),
		repositories: [...repositories.entries()]
			.map(([repository, tally]) => ({
				repository,
				stars: tally.stars,
				mergeAuthors: tally.authors.size,
			}))
			.toSorted((left, right) =>
				compareText(left.repository, right.repository)
			),
	}
}
