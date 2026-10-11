import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Result, Schema } from 'effect'
import {
	aggregateDay,
	dailyAggregateSchema,
	mergeDailyAggregates,
} from './daily-aggregate'
import type { MergeEvent, MergeKind } from './merge-event'

const date = isoDateSchema.make('2026-10-03')
const login = githubLoginSchema.make

interface MergeInput {
	readonly author: string
	readonly repository: string
	readonly mergeKind?: MergeKind
	readonly number?: number
}

const merge = ({
	author,
	repository,
	mergeKind = 'merged',
	number = 1,
}: MergeInput): MergeEvent => ({
	author: login(author),
	repository,
	repositoryId: 1,
	owner: repository.split('/')[0] ?? '',
	mergedBy: undefined,
	mergedAt: '2026-10-03T00:00:00Z',
	number,
	mergeKind,
})

const star = (repository: string) => ({
	repository,
	stargazer: login('zoe'),
})

describe('aggregateDay', () => {
	it('counts merges per author and repository and keeps merged PR numbers', () => {
		expect(
			aggregateDay({
				date,
				merges: [
					merge({ author: 'alice', repository: 'acme/widgets', number: 9 }),
					merge({ author: 'alice', repository: 'acme/widgets', number: 2 }),
					merge({
						author: 'alice',
						repository: 'acme/widgets',
						mergeKind: 'selfMerged',
						number: 5,
					}),
					merge({ author: 'bob', repository: 'acme/widgets', number: 3 }),
				],
				stars: [],
			}).contributions
		).toEqual([
			{
				author: 'alice',
				repository: 'acme/widgets',
				merged: 2,
				selfMerged: 1,
				mergedPullRequests: [2, 9],
			},
			{
				author: 'bob',
				repository: 'acme/widgets',
				merged: 1,
				selfMerged: 0,
				mergedPullRequests: [3],
			},
		])
	})

	it('keeps own-repo merges out of the rows and counts them per author', () => {
		const aggregate = aggregateDay({
			date,
			merges: [
				merge({
					author: 'alice',
					repository: 'alice/dotfiles',
					mergeKind: 'ownRepo',
				}),
				merge({
					author: 'Alice',
					repository: 'Alice/blog',
					mergeKind: 'ownRepo',
				}),
				merge({ author: 'bob', repository: 'bob/site', mergeKind: 'ownRepo' }),
			],
			stars: [],
		})

		expect(aggregate.contributions).toEqual([])
		expect(aggregate.ownRepoMerges).toEqual({ alice: 2, bob: 1 })
		expect(aggregate.totals.ownRepo).toBe(3)
	})

	it('merges logins and repository names that differ only in case', () => {
		const aggregate = aggregateDay({
			date,
			merges: [
				merge({ author: 'Alice', repository: 'Owner/Repo', number: 1 }),
				merge({ author: 'alice', repository: 'owner/repo', number: 2 }),
			],
			stars: [star('OWNER/repo'), star('owner/repo')],
		})

		expect(aggregate.contributions).toEqual([
			{
				author: 'alice',
				repository: 'owner/repo',
				merged: 2,
				selfMerged: 0,
				mergedPullRequests: [1, 2],
			},
		])
		expect(aggregate.repositories).toEqual([
			{ repository: 'owner/repo', stars: 2, mergeAuthors: 1 },
		])
	})

	it('counts stars and distinct merge authors other than the owner', () => {
		expect(
			aggregateDay({
				date,
				merges: [
					merge({ author: 'alice', repository: 'acme/widgets' }),
					merge({ author: 'alice', repository: 'acme/widgets' }),
					merge({
						author: 'bob',
						repository: 'acme/widgets',
						mergeKind: 'selfMerged',
					}),
					merge({
						author: 'acme',
						repository: 'acme/widgets',
						mergeKind: 'ownRepo',
					}),
				],
				stars: [star('acme/widgets'), star('lonely/repo'), star('lonely/repo')],
			}).repositories
		).toEqual([
			{ repository: 'acme/widgets', stars: 1, mergeAuthors: 2 },
			{ repository: 'lonely/repo', stars: 2, mergeAuthors: 0 },
		])
	})

	it('totals merges by kind and stars', () => {
		expect(
			aggregateDay({
				date,
				merges: [
					merge({ author: 'alice', repository: 'acme/widgets' }),
					merge({
						author: 'bob',
						repository: 'acme/widgets',
						mergeKind: 'selfMerged',
					}),
					merge({
						author: 'acme',
						repository: 'acme/widgets',
						mergeKind: 'ownRepo',
					}),
				],
				stars: [star('acme/widgets')],
			}).totals
		).toEqual({ merged: 1, selfMerged: 1, ownRepo: 1, stars: 1 })
	})

	it('returns an empty aggregate for a day without events', () => {
		expect(aggregateDay({ date, merges: [], stars: [] })).toEqual({
			date,
			totals: { merged: 0, selfMerged: 0, ownRepo: 0, stars: 0 },
			contributions: [],
			ownRepoMerges: {},
			repositories: [],
		})
	})
})

describe('mergeDailyAggregates', () => {
	const morning = aggregateDay({
		date,
		merges: [
			merge({ author: 'alice', repository: 'acme/widgets', number: 9 }),
			merge({ author: 'alice', repository: 'acme/widgets', number: 4 }),
			merge({ author: 'bob', repository: 'zed/tool', number: 1 }),
			merge({ author: 'alice', repository: 'alice/x', mergeKind: 'ownRepo' }),
		],
		stars: [star('acme/widgets'), star('lonely/repo')],
	})
	const evening = aggregateDay({
		date,
		merges: [
			merge({ author: 'alice', repository: 'acme/widgets', number: 9 }),
			merge({ author: 'alice', repository: 'acme/widgets', number: 2 }),
			merge({
				author: 'carol',
				repository: 'acme/widgets',
				mergeKind: 'selfMerged',
				number: 3,
			}),
			merge({ author: 'alice', repository: 'alice/y', mergeKind: 'ownRepo' }),
			merge({ author: 'dan', repository: 'dan/z', mergeKind: 'ownRepo' }),
		],
		stars: [star('acme/widgets'), star('acme/widgets'), star('beta/app')],
	})
	const merged = Result.getOrThrow(mergeDailyAggregates([morning, evening]))

	it('sums an (author, repository) row across parts, a repeated pull request once', () => {
		expect(merged.contributions).toEqual([
			{
				author: 'alice',
				repository: 'acme/widgets',
				merged: 3,
				selfMerged: 0,
				mergedPullRequests: [2, 4, 9],
			},
			{
				author: 'carol',
				repository: 'acme/widgets',
				merged: 0,
				selfMerged: 1,
				mergedPullRequests: [],
			},
			{
				author: 'bob',
				repository: 'zed/tool',
				merged: 1,
				selfMerged: 0,
				mergedPullRequests: [1],
			},
		])
	})

	it('sums stars and recounts distinct merge authors per repository', () => {
		expect(merged.repositories).toEqual([
			{ repository: 'acme/widgets', stars: 3, mergeAuthors: 2 },
			{ repository: 'beta/app', stars: 1, mergeAuthors: 0 },
			{ repository: 'lonely/repo', stars: 1, mergeAuthors: 0 },
			{ repository: 'zed/tool', stars: 0, mergeAuthors: 1 },
		])
	})

	it('sums own-repo merges per login and totals, without the repeated pull request', () => {
		expect(merged.ownRepoMerges).toEqual({ alice: 2, dan: 1 })
		expect(Object.keys(merged.ownRepoMerges)).toEqual(['alice', 'dan'])
		expect(merged.totals).toEqual({
			merged: 4,
			selfMerged: 1,
			ownRepo: 3,
			stars: 5,
		})
	})

	it('equals the aggregate of every event when no pull request repeats', () => {
		const first = [
			merge({ author: 'bob', repository: 'zed/tool', number: 1 }),
			merge({ author: 'alice', repository: 'acme/widgets', number: 7 }),
		]
		const second = [
			merge({ author: 'alice', repository: 'acme/widgets', number: 3 }),
			merge({ author: 'eve', repository: 'eve/x', mergeKind: 'ownRepo' }),
		]

		expect(
			Result.getOrThrow(
				mergeDailyAggregates([
					aggregateDay({ date, merges: first, stars: [star('zed/tool')] }),
					aggregateDay({ date, merges: second, stars: [star('acme/x')] }),
				])
			)
		).toEqual(
			aggregateDay({
				date,
				merges: [...second, ...first],
				stars: [star('acme/x'), star('zed/tool')],
			})
		)
	})

	it('does not depend on the order of the parts', () => {
		expect(Result.getOrThrow(mergeDailyAggregates([evening, morning]))).toEqual(
			merged
		)
	})

	it('returns a single part unchanged', () => {
		expect(Result.getOrThrow(mergeDailyAggregates([morning]))).toEqual(morning)
	})

	it('fails without parts', () => {
		expect(Result.merge(mergeDailyAggregates([]))).toMatchObject({
			_tag: 'DailyAggregateMergeError',
			dates: [],
		})
	})

	it('fails for parts of different days', () => {
		expect(
			Result.merge(
				mergeDailyAggregates([
					morning,
					{ ...evening, date: isoDateSchema.make('2026-10-04') },
				])
			)
		).toMatchObject({
			_tag: 'DailyAggregateMergeError',
			dates: ['2026-10-03', '2026-10-04'],
		})
	})
})

describe('dailyAggregateSchema', () => {
	const decodeJson = Schema.decodeUnknownResult(
		Schema.fromJsonString(dailyAggregateSchema)
	)
	const aggregate = aggregateDay({
		date,
		merges: [
			merge({ author: 'alice', repository: 'acme/widgets' }),
			merge({ author: 'alice', repository: 'alice/x', mergeKind: 'ownRepo' }),
		],
		stars: [star('acme/widgets')],
	})

	it('round-trips through JSON', () => {
		expect(Result.getOrThrow(decodeJson(JSON.stringify(aggregate)))).toEqual(
			aggregate
		)
	})

	it('tolerates fields added by a later file version', () => {
		expect(
			Result.isSuccess(decodeJson(JSON.stringify({ ...aggregate, version: 2 })))
		).toBe(true)
	})

	it('rejects a negative count', () => {
		expect(
			Result.isFailure(
				decodeJson(
					JSON.stringify({
						...aggregate,
						repositories: [
							{ repository: 'acme/widgets', stars: -1, mergeAuthors: 0 },
						],
					})
				)
			)
		).toBe(true)
	})

	it('rejects a malformed date', () => {
		expect(
			Result.isFailure(
				decodeJson(JSON.stringify({ ...aggregate, date: '2026-10-3' }))
			)
		).toBe(true)
	})
})
