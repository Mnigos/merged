import type { DailyAggregate } from '@modules/ingest/domain/daily-aggregate'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import { seasonIdSchema } from '@shared/schema/season-id'
import {
	toPullRequestKey,
	type ContributorProfile,
	type PullRequestKey,
	type RepositoryProfile,
	type SeasonEnrichment,
} from '../domain/enrichment'
import { assembleSeason } from '../domain/season'

export const login = githubLoginSchema.make
export const seasonId = seasonIdSchema.make('2026-10')
export const computedAt = '2026-10-04T06:00:00.000Z'

/** One contribution row: `merged` defaults to the number of pull request numbers. */
export interface RowInput {
	readonly author: string
	readonly repository: string
	readonly pullRequests?: readonly number[]
	readonly merged?: number
	readonly selfMerged?: number
}

export interface DayInput {
	readonly date: string
	readonly rows?: readonly RowInput[]
	readonly stars?: Readonly<Record<string, number>>
	readonly ownRepo?: Readonly<Record<string, number>>
}

/** A daily aggregate built from compact rows, totals derived from them. */
export function toDay({
	date,
	rows = [],
	stars = {},
	ownRepo = {},
}: DayInput): DailyAggregate {
	const contributions = rows.map(row => ({
		author: login(row.author),
		repository: row.repository,
		merged: row.merged ?? row.pullRequests?.length ?? 0,
		selfMerged: row.selfMerged ?? 0,
		mergedPullRequests: [...(row.pullRequests ?? [])],
	}))
	const repositories = [
		...new Set([...rows.map(row => row.repository), ...Object.keys(stars)]),
	].map(repository => ({
		repository,
		stars: stars[repository] ?? 0,
		mergeAuthors: new Set(
			rows.filter(row => row.repository === repository).map(row => row.author)
		).size,
	}))

	return {
		date: isoDateSchema.make(date),
		totals: {
			merged: contributions.reduce((total, row) => total + row.merged, 0),
			selfMerged: contributions.reduce(
				(total, row) => total + row.selfMerged,
				0
			),
			ownRepo: Object.values(ownRepo).reduce(
				(total, count) => total + count,
				0
			),
			stars: Object.values(stars).reduce((total, count) => total + count, 0),
		},
		contributions,
		ownRepoMerges: { ...ownRepo },
		repositories,
	}
}

/** A season of 2026-10 assembled from compact days. */
export const toSeason = (...days: readonly DayInput[]) =>
	assembleSeason({ seasonId, days: days.map(toDay) })

export interface EnrichmentInput {
	readonly repositories?: Readonly<Record<string, RepositoryProfile>>
	readonly contributors?: Readonly<Record<string, Partial<ContributorProfile>>>
	readonly mergers?: Readonly<Record<PullRequestKey, string>>
}

/** Enrichment from plain records; contributor profiles default to unknown name and location. */
export const toEnrichment = ({
	repositories = {},
	contributors = {},
	mergers = {},
}: EnrichmentInput): SeasonEnrichment => ({
	repositories: new Map(Object.entries(repositories)),
	contributors: new Map(
		Object.entries(contributors).map(([key, profile]) => [
			login(key),
			{ name: null, location: null, isBot: false, ...profile },
		])
	),
	mergers: new Map(
		Object.entries(mergers).map(([key, merger]) => {
			const [repository = '', number = ''] = key.split('#')

			return [toPullRequestKey(repository, Number(number)), login(merger)]
		})
	),
})
