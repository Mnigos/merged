import { describe, expect, it } from '@effect/vitest'
import { MAX_BATCH_SIZE } from '@shared/github/graphql-batch'
import {
	inMemoryGitHubGraphqlLayer,
	type GraphqlCall,
} from '@shared/github/testing/in-memory-github-graphql'
import { githubLoginSchema } from '@shared/schema/github-login'
import { seasonIdSchema } from '@shared/schema/season-id'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import type { EnrichmentTargets } from '../domain/enrichment-targets'
import { DEFAULT_MAX_AGE_DAYS } from '../domain/freshness'
import type { RepositoryProfile } from '../domain/repository-profile'
import { profilesLayer } from '../profiles.layer'
import { fakeGitHubHandler, type FakeGitHub } from '../testing/fake-github.mock'
import { PERSIST_EVERY_BATCHES } from './enrich-kind'
import { Enrich } from './enrich.service'
import { SeasonProfiles } from './season-profiles.service'

const NOW = Date.parse('2026-10-10T06:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const seasonId = seasonIdSchema.make('2026-10')
const login = githubLoginSchema.make
const isoDaysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString()

const targetsOf = ({
	contributors = [],
	repositories = [],
	pullRequests = [],
}: Partial<EnrichmentTargets>): EnrichmentTargets => ({
	contributors,
	repositories,
	pullRequests,
})

const repositoryNames = (count: number) =>
	Array.from({ length: count }, (_, index) => `owner/repo-${index}`)

interface Setup {
	readonly fake?: FakeGitHub
	readonly files?: Map<string, string>
}

const setup = ({ fake = {}, files = new Map() }: Setup = {}) => {
	const calls: GraphqlCall[] = []
	const layer = profilesLayer.pipe(
		Layer.provide(
			Layer.mergeAll(
				inMemoryJsonStorageLayer(files),
				inMemoryGitHubGraphqlLayer(fakeGitHubHandler(fake), calls)
			)
		)
	)

	return { calls, files, layer }
}

const aliasCount = (call: GraphqlCall) =>
	Object.keys(call.variables).filter(
		name => name.startsWith('owner') || name.startsWith('login')
	).length

const readFiles = Effect.gen(function* () {
	const files = yield* (yield* SeasonProfiles).read(seasonId)

	return {
		repositories: Option.getOrThrow(files.repositories).repositories,
		contributors: Option.getOrThrow(files.contributors).contributors,
		pullRequests: Option.getOrThrow(files.mergers).pullRequests,
	}
})

const repositoryProfile = (
	repository: string,
	stars: number,
	fetchedAt: string
): RepositoryProfile => ({
	repository,
	stars,
	language: null,
	fetchedAt,
	missing: false,
})

const resolution = (
	number: number,
	mergedBy: string | null,
	fetchedAt: string
) => ({
	repository: 'acme/widgets',
	number,
	mergedBy,
	fetchedAt,
})

const seededRepositories = (profiles: readonly RepositoryProfile[]) =>
	new Map([
		[
			'seasons/2026-10/repos.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: isoDaysAgo(1),
				repositories: Object.fromEntries(
					profiles.map(profile => [profile.repository, profile])
				),
			}),
		],
	])

describe('Enrich', () => {
	it.effect.each([100, 101, 250])(
		'fetches %d repositories in batches of 100 aliases',
		count => {
			const repositories = repositoryNames(count)
			const { calls, layer } = setup({
				fake: {
					repositories: Object.fromEntries(
						repositories.map((repository, index) => [
							repository,
							{ stars: index, language: 'Go' },
						])
					),
				},
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* Enrich).run(
					seasonId,
					targetsOf({ repositories })
				)

				expect(calls.map(aliasCount)).toEqual(
					Array.from(
						{ length: Math.ceil(count / MAX_BATCH_SIZE) },
						(_, index) =>
							Math.min(MAX_BATCH_SIZE, count - index * MAX_BATCH_SIZE)
					)
				)
				expect(
					calls.every(call =>
						call.document.includes('rateLimit { cost remaining resetAt }')
					)
				).toBe(true)
				expect(report.repositories).toMatchObject({
					requested: count,
					cached: 0,
					fetched: count,
					missing: 0,
					failed: 0,
					queries: Math.ceil(count / MAX_BATCH_SIZE),
					cost: Math.ceil(count / MAX_BATCH_SIZE),
					remaining: 4000,
					writes: 1,
				})
				expect(report).toMatchObject({
					queries: Math.ceil(count / MAX_BATCH_SIZE),
					cost: Math.ceil(count / MAX_BATCH_SIZE),
					filesWritten: 3,
				})
				const { repositories: stored } = yield* readFiles
				expect(stored[`owner/repo-${count - 1}`]).toEqual({
					repository: `owner/repo-${count - 1}`,
					stars: count - 1,
					language: 'Go',
					fetchedAt: new Date(NOW).toISOString(),
					missing: false,
				})
				expect(Object.keys(stored)).toHaveLength(count)
				for (const [index, repository] of repositories.entries())
					expect(stored[repository]?.stars).toBe(index)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'records not found as missing and leaves other errors for the next run',
		() => {
			const { layer } = setup({
				fake: {
					repositories: { 'acme/widgets': { stars: 1200 } },
					users: { alice: { name: 'Alice', location: 'Kraków' } },
					forbidden: ['saml/locked', 'carol'],
				},
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* Enrich).run(
					seasonId,
					targetsOf({
						repositories: ['acme/widgets', 'gone/away', 'saml/locked'],
						contributors: [login('alice'), login('dependabot'), login('carol')],
					})
				)

				expect(report.repositories).toMatchObject({
					fetched: 2,
					missing: 1,
					failed: 1,
				})
				expect(report.contributors).toMatchObject({
					fetched: 2,
					missing: 1,
					failed: 1,
				})
				const { repositories, contributors } = yield* readFiles
				expect(repositories['gone/away']).toMatchObject({
					stars: 0,
					missing: true,
				})
				expect(repositories['saml/locked']).toBeUndefined()
				expect(contributors['alice']).toEqual({
					login: 'alice',
					name: 'Alice',
					location: 'Kraków',
					company: null,
					avatarUrl: 'https://avatars.example/alice',
					fetchedAt: new Date(NOW).toISOString(),
					missing: false,
				})
				expect(contributors['dependabot']).toMatchObject({ missing: true })
				expect(contributors['carol']).toBeUndefined()
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('keeps fresh entries and refetches stale ones', () => {
		const { calls, layer } = setup({
			fake: {
				repositories: { 'a/fresh': { stars: 99 }, 'a/stale': { stars: 42 } },
			},
			files: seededRepositories([
				repositoryProfile('a/fresh', 5, isoDaysAgo(DEFAULT_MAX_AGE_DAYS - 1)),
				repositoryProfile('a/stale', 5, isoDaysAgo(DEFAULT_MAX_AGE_DAYS + 1)),
				repositoryProfile('a/other', 7, isoDaysAgo(30)),
			]),
		})

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			const report = yield* (yield* Enrich).run(
				seasonId,
				targetsOf({ repositories: ['a/fresh', 'a/stale'] })
			)

			expect(report.repositories).toMatchObject({
				requested: 2,
				cached: 1,
				fetched: 1,
				queries: 1,
			})
			expect(calls[0]?.variables).toEqual({ owner0: 'a', name0: 'stale' })
			const { repositories } = yield* readFiles
			expect(repositories['a/fresh']?.stars).toBe(5)
			expect(repositories['a/stale']?.stars).toBe(42)
			expect(repositories['a/other']?.stars).toBe(7)
		}).pipe(Effect.provide(layer))
	})

	it.effect('refetches everything with a max age of 0 days', () => {
		const { layer } = setup({
			fake: { repositories: { 'a/fresh': { stars: 99 } } },
			files: seededRepositories([
				repositoryProfile('a/fresh', 5, isoDaysAgo(0)),
			]),
		})

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			const report = yield* (yield* Enrich).run(
				seasonId,
				targetsOf({ repositories: ['a/fresh'] }),
				{ maxAgeDays: 0 }
			)

			expect(report.repositories).toMatchObject({ cached: 0, fetched: 1 })
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'never refetches a known merger and retries an unknown one once stale',
		() => {
			const { calls, layer } = setup({
				fake: {
					pullRequests: {
						'acme/widgets#1': 'Someone',
						'acme/widgets#2': 'Alice',
						'acme/widgets#3': 'Alice',
					},
				},
				files: new Map([
					[
						'seasons/2026-10/mergers.json',
						JSON.stringify({
							season: '2026-10',
							updatedAt: isoDaysAgo(1),
							pullRequests: {
								'acme/widgets#1': resolution(1, 'bob', isoDaysAgo(60)),
								'acme/widgets#2': resolution(2, null, isoDaysAgo(1)),
								'acme/widgets#3': resolution(3, null, isoDaysAgo(8)),
							},
						}),
					],
				]),
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* Enrich).run(
					seasonId,
					targetsOf({
						pullRequests: [1, 2, 3, 4].map(number => ({
							repository: 'acme/widgets',
							number,
						})),
					})
				)

				expect(report.pullRequests).toMatchObject({
					requested: 4,
					cached: 2,
					fetched: 2,
					missing: 1,
					queries: 1,
				})
				expect(calls[0]?.variables).toMatchObject({ number0: 3, number1: 4 })
				const { pullRequests } = yield* readFiles
				expect(pullRequests['acme/widgets#1']?.mergedBy).toBe('bob')
				expect(pullRequests['acme/widgets#2']?.mergedBy).toBeNull()
				expect(pullRequests['acme/widgets#3']?.mergedBy).toBe('alice')
				expect(pullRequests['acme/widgets#4']).toEqual({
					repository: 'acme/widgets',
					number: 4,
					mergedBy: null,
					fetchedAt: new Date(NOW).toISOString(),
				})
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'resolves a merged pull request without a known merger to null',
		() => {
			const { layer } = setup({
				fake: { pullRequests: { 'acme/widgets#5': null } },
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				yield* (yield* Enrich).run(
					seasonId,
					targetsOf({
						pullRequests: [{ repository: 'acme/widgets', number: 5 }],
					})
				)

				expect(
					(yield* readFiles).pullRequests['acme/widgets#5']?.mergedBy
				).toBeNull()
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('honours the limits per kind', () => {
		const { calls, layer } = setup()

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			const report = yield* (yield* Enrich).run(
				seasonId,
				targetsOf({
					repositories: repositoryNames(5),
					contributors: [login('a'), login('b'), login('c')],
					pullRequests: [{ repository: 'a/b', number: 1 }],
				}),
				{ repositories: 2, contributors: 1, pullRequests: 0 }
			)

			expect(report.repositories.requested).toBe(2)
			expect(report.contributors.requested).toBe(1)
			expect(report.pullRequests).toMatchObject({ requested: 0, queries: 0 })
			expect(calls.map(aliasCount)).toEqual([2, 1])
			const { repositories, contributors, pullRequests } = yield* readFiles
			expect(Object.keys(repositories)).toEqual([
				'owner/repo-0',
				'owner/repo-1',
			])
			expect(Object.keys(contributors)).toEqual(['a'])
			expect(pullRequests).toEqual({})
		}).pipe(Effect.provide(layer))
	})

	it.effect('writes progress every 10 batches and at the end', () => {
		const batches = PERSIST_EVERY_BATCHES + 1
		const { layer } = setup()

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			const report = yield* (yield* Enrich).run(
				seasonId,
				targetsOf({ repositories: repositoryNames(batches * MAX_BATCH_SIZE) })
			)

			expect(report.repositories).toMatchObject({
				queries: batches,
				missing: batches * MAX_BATCH_SIZE,
				writes: 2,
			})
			expect(report.repositories.bytesWritten).toBeGreaterThan(
				report.repositories.fileBytes
			)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails when a whole query returns no data', () =>
		Effect.gen(function* () {
			yield* TestClock.setTime(NOW)

			expect(
				yield* Effect.flip(
					(yield* Enrich).run(seasonId, targetsOf({ repositories: ['a/b'] }))
				)
			).toMatchObject({ _tag: 'ProfileSourceError' })
		}).pipe(
			Effect.provide(
				profilesLayer.pipe(
					Layer.provide(
						Layer.mergeAll(
							inMemoryJsonStorageLayer(),
							inMemoryGitHubGraphqlLayer(() => ({
								data: null,
								errors: [{ message: 'Something went wrong' }],
							}))
						)
					)
				)
			)
		)
	)

	it.effect(
		'writes all three empty files without querying for zero targets',
		() => {
			const { calls, files, layer } = setup()

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* Enrich).run(seasonId, targetsOf({}))
				expect(calls).toEqual([])
				expect(yield* readFiles).toEqual({
					repositories: {},
					contributors: {},
					pullRequests: {},
				})
				expect(report).toMatchObject({ queries: 0, cost: 0, filesWritten: 3 })
				for (const kind of [
					report.repositories,
					report.contributors,
					report.pullRequests,
				])
					expect(kind).toMatchObject({
						requested: 0,
						cached: 0,
						fetched: 0,
						missing: 0,
						failed: 0,
						queries: 0,
						cost: 0,
						writes: 1,
					})
				expect(report.bytesWritten).toBe(
					[...files.values()].reduce(
						(sum, text) => sum + Buffer.byteLength(text),
						0
					)
				)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'rewrites cached files without querying and retains fetched timestamps',
		() => {
			const targets = targetsOf({
				repositories: ['a/b'],
				contributors: [login('alice')],
				pullRequests: [{ repository: 'a/b', number: 1 }],
			})
			const { calls, layer } = setup({
				fake: {
					repositories: { 'a/b': { stars: 10 } },
					users: { alice: { name: 'Alice' } },
					pullRequests: { 'a/b#1': 'Maintainer' },
				},
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const enrich = yield* Enrich
				yield* enrich.run(seasonId, targets)
				const before = yield* readFiles
				calls.length = 0
				yield* TestClock.adjust('1 day')
				const report = yield* enrich.run(seasonId, targets)
				expect(calls).toEqual([])
				expect(yield* readFiles).toEqual(before)
				expect(report).toMatchObject({ queries: 0, cost: 0, filesWritten: 3 })
				for (const kind of [
					report.repositories,
					report.contributors,
					report.pullRequests,
				])
					expect(kind).toMatchObject({
						requested: 1,
						cached: 1,
						fetched: 0,
						missing: 0,
						failed: 0,
						queries: 0,
						cost: 0,
						writes: 1,
					})
				const files = yield* (yield* SeasonProfiles).read(seasonId)
				for (const file of [
					Option.getOrThrow(files.repositories),
					Option.getOrThrow(files.contributors),
					Option.getOrThrow(files.mergers),
				])
					expect(file.updatedAt).toBe(isoDaysAgo(-1))
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'expires profiles exactly at maxAgeDays but retains known mergers even at zero max age',
		() => {
			const targets = targetsOf({
				repositories: ['a/b'],
				contributors: [login('alice')],
				pullRequests: [{ repository: 'a/b', number: 1 }],
			})
			const { calls, layer } = setup({
				fake: {
					repositories: { 'a/b': { stars: 10 } },
					users: { alice: { name: 'Alice' } },
					pullRequests: { 'a/b#1': 'Maintainer' },
				},
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const enrich = yield* Enrich
				yield* enrich.run(seasonId, targets)
				calls.length = 0
				yield* TestClock.adjust('2 days')
				const stale = yield* enrich.run(seasonId, targets, { maxAgeDays: 2 })
				expect(stale.repositories).toMatchObject({ cached: 0, fetched: 1 })
				expect(stale.contributors).toMatchObject({ cached: 0, fetched: 1 })
				expect(stale.pullRequests).toMatchObject({ cached: 1, fetched: 0 })
				expect(calls).toHaveLength(2)
				calls.length = 0
				const forced = yield* enrich.run(seasonId, targets, { maxAgeDays: 0 })
				expect(forced.pullRequests).toMatchObject({
					cached: 1,
					fetched: 0,
					queries: 0,
				})
				expect(calls).toHaveLength(2)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'totals mixed outcomes across all kinds and retries only failed nodes on rerun',
		() => {
			const { calls, layer } = setup({
				fake: {
					repositories: { 'a/found': { stars: 10 } },
					users: { found: { name: 'Found' } },
					pullRequests: { 'a/found#1': 'Maintainer' },
					forbidden: ['a/locked', 'locked', 'a/found#3'],
				},
				files: seededRepositories([
					repositoryProfile('a/cached', 25, isoDaysAgo(1)),
				]),
			})
			const targets = targetsOf({
				repositories: ['a/cached', 'a/found', 'a/gone', 'a/locked'],
				contributors: [login('found'), login('gone'), login('locked')],
				pullRequests: [1, 2, 3].map(number => ({
					repository: 'a/found',
					number,
				})),
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const enrich = yield* Enrich
				const report = yield* enrich.run(seasonId, targets)
				expect(report.repositories).toMatchObject({
					requested: 4,
					cached: 1,
					fetched: 2,
					missing: 1,
					failed: 1,
					queries: 1,
					cost: 1,
				})
				for (const kind of [report.contributors, report.pullRequests])
					expect(kind).toMatchObject({
						requested: 3,
						cached: 0,
						fetched: 2,
						missing: 1,
						failed: 1,
						queries: 1,
						cost: 1,
					})
				expect(report).toMatchObject({ queries: 3, cost: 3, filesWritten: 3 })
				for (const kind of [
					report.repositories,
					report.contributors,
					report.pullRequests,
				])
					expect(kind.requested).toBe(kind.cached + kind.fetched + kind.failed)
				const stored = yield* readFiles
				expect(stored.repositories['a/locked']).toBeUndefined()
				expect(stored.contributors['locked']).toBeUndefined()
				expect(stored.pullRequests['a/found#3']).toBeUndefined()
				calls.length = 0
				const rerun = yield* enrich.run(seasonId, targets)
				expect(calls.map(call => call.variables)).toEqual([
					{ owner0: 'a', name0: 'locked' },
					{ login0: 'locked' },
					{ owner0: 'a', name0: 'found', number0: 3 },
				])
				for (const kind of [
					rerun.repositories,
					rerun.contributors,
					rerun.pullRequests,
				])
					expect(kind).toMatchObject({
						fetched: 0,
						missing: 0,
						failed: 1,
						queries: 1,
						cost: 1,
					})
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'counts a nested per-node error as failed without caching an unknown merger',
		() => {
			const layer = profilesLayer.pipe(
				Layer.provide(
					Layer.mergeAll(
						inMemoryJsonStorageLayer(),
						inMemoryGitHubGraphqlLayer(() => ({
							data: {
								a0: { pullRequest: null },
								rateLimit: {
									cost: 1,
									remaining: 4000,
									resetAt: isoDaysAgo(-1),
								},
							},
							errors: [
								{
									type: 'FORBIDDEN',
									path: ['a0', 'pullRequest'],
									message: 'Forbidden',
								},
							],
						}))
					)
				)
			)

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* Enrich).run(
					seasonId,
					targetsOf({ pullRequests: [{ repository: 'a/b', number: 1 }] })
				)
				expect({
					fetched: report.pullRequests.fetched,
					missing: report.pullRequests.missing,
					failed: report.pullRequests.failed,
					stored: (yield* readFiles).pullRequests,
				}).toEqual({ fetched: 0, missing: 0, failed: 1, stored: {} })
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'applies independent positive limits and sums reported query costs',
		() => {
			const calls: GraphqlCall[] = []
			const layer = profilesLayer.pipe(
				Layer.provide(
					Layer.mergeAll(
						inMemoryJsonStorageLayer(),
						inMemoryGitHubGraphqlLayer(
							(document, variables) => ({
								data: {
									...Object.fromEntries(
										Object.keys(variables)
											.filter(
												key =>
													key.startsWith('owner') || key.startsWith('login')
											)
											.map((_, index) => [`a${index}`, null])
									),
									rateLimit: {
										cost: document.includes('user(')
											? 3
											: document.includes('pullRequest(')
												? 5
												: 2,
										remaining: 4000,
										resetAt: isoDaysAgo(-1),
									},
								},
								errors: [],
							}),
							calls
						)
					)
				)
			)

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* Enrich).run(
					seasonId,
					targetsOf({
						repositories: repositoryNames(5),
						contributors: [login('a'), login('b'), login('c')],
						pullRequests: [1, 2, 3, 4].map(number => ({
							repository: 'a/b',
							number,
						})),
					}),
					{ repositories: 2, contributors: 1, pullRequests: 3 }
				)
				expect(calls.map(aliasCount)).toEqual([2, 1, 3])
				expect(calls.map(call => call.variables)).toEqual([
					{
						owner0: 'owner',
						name0: 'repo-0',
						owner1: 'owner',
						name1: 'repo-1',
					},
					{ login0: 'a' },
					{
						owner0: 'a',
						name0: 'b',
						number0: 1,
						owner1: 'a',
						name1: 'b',
						number1: 2,
						owner2: 'a',
						name2: 'b',
						number2: 3,
					},
				])
				expect(report.repositories).toMatchObject({
					requested: 2,
					fetched: 2,
					cost: 2,
				})
				expect(report.contributors).toMatchObject({
					requested: 1,
					fetched: 1,
					cost: 3,
				})
				expect(report.pullRequests).toMatchObject({
					requested: 3,
					fetched: 3,
					cost: 5,
				})
				expect(report).toMatchObject({ queries: 3, cost: 10, filesWritten: 3 })
			}).pipe(Effect.provide(layer))
		}
	)
})
