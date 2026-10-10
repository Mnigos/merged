import { describe, expect, it } from '@effect/vitest'
import { dailyAggregateSchema } from '@modules/ingest/domain/daily-aggregate'
import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { seasonProfilesLayer } from '@modules/profiles/profiles.layer'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { POPULARITY_OFFSET, PR_WEIGHT, SCORE_SCALE } from '../domain/scoring'
import { jsonSeasonStoreLayer } from '../infrastructure/json-season-store'
import { profilesEnrichmentSourceLayer } from '../infrastructure/profiles-enrichment-source'
import { seasonId, toDay } from '../testing/season.mock'
import { BuildSeason } from './build-season.service'
import { SeasonStore } from './season-store.port'

const NOW = Date.parse('2026-10-10T06:00:00Z')
const fetchedAt = '2026-10-10T05:00:00.000Z'
const encodeDay = Schema.encodeSync(Schema.fromJsonString(dailyAggregateSchema))

const dayFiles = () =>
	new Map([
		[
			'days/2026-10-01.json',
			encodeDay(
				toDay({
					date: '2026-10-01',
					rows: [
						{ author: 'alice', repository: 'big/lib', pullRequests: [1] },
						{ author: 'bob', repository: 'acme/widgets', pullRequests: [2] },
						{ author: 'carol', repository: 'acme/widgets', pullRequests: [3] },
					],
				})
			),
		],
	])

const contributor = (login: string, location: string | null) => ({
	login,
	name: null,
	location,
	company: null,
	avatarUrl: null,
	fetchedAt,
	missing: false,
})

const profileFiles = () =>
	new Map([
		[
			'seasons/2026-10/repos.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: fetchedAt,
				repositories: {
					'big/lib': {
						repository: 'big/lib',
						stars: 500,
						language: 'Rust',
						fetchedAt,
						missing: false,
					},
				},
			}),
		],
		[
			'seasons/2026-10/profiles.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: fetchedAt,
				contributors: {
					alice: contributor('alice', 'Berlin'),
					bob: contributor('bob', null),
					carol: contributor('carol', 'Gdańsk, Poland'),
				},
			}),
		],
		[
			'seasons/2026-10/mergers.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: fetchedAt,
				pullRequests: {
					'acme/widgets#2': {
						repository: 'acme/widgets',
						number: 2,
						mergedBy: 'BoB',
						fetchedAt,
					},
					'acme/widgets#3': {
						repository: 'acme/widgets',
						number: 3,
						mergedBy: 'maintainer',
						fetchedAt,
					},
				},
			}),
		],
	])

const buildLayer = (files: Map<string, string>) =>
	BuildSeason.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(
				jsonSeasonStoreLayer,
				dailyAggregatesLayer,
				profilesEnrichmentSourceLayer.pipe(Layer.provide(seasonProfilesLayer))
			)
		),
		Layer.provide(inMemoryJsonStorageLayer(files))
	)

const build = Effect.gen(function* () {
	yield* TestClock.setTime(NOW)
	const report = yield* (yield* BuildSeason).run(seasonId)
	const store = yield* SeasonStore
	const board = (id: 'global' | 'poland') =>
		store
			.readBoard(seasonId, id)
			.pipe(Effect.map(file => Option.getOrThrow(file).rows))

	return {
		report,
		global: yield* board('global'),
		poland: yield* board('poland'),
	}
})

describe('BuildSeason with profiles enrichment', () => {
	it.effect('scores pass 1 from archive proxies before enrich ran', () =>
		Effect.gen(function* () {
			const { report, global, poland } = yield* build

			expect(report.withoutCountedRepository).toBe(1)
			expect(
				global.map(row => [row.login, row.selfMergedPullRequests])
			).toEqual([
				['bob', 0],
				['carol', 0],
			])
			expect(poland).toEqual([])
		}).pipe(Effect.provide(buildLayer(dayFiles())))
	)

	it.effect(
		'scores pass 2: real stars count a lone repository, mergers resolve self-merges, locations fill the Poland board',
		() =>
			Effect.gen(function* () {
				const { report, global, poland } = yield* build

				expect(report.withoutCountedRepository).toBe(0)
				expect(global[0]).toMatchObject({
					login: 'alice',
					mergedPullRequests: 1,
					topRepositories: [{ repository: 'big/lib', counted: true }],
				})
				expect(
					global.map(row => [
						row.login,
						row.mergedPullRequests,
						row.selfMergedPullRequests,
					])
				).toEqual([
					['alice', 1, 0],
					['carol', 1, 0],
					['bob', 0, 1],
				])
				const bob = global.find(row => row.login === 'bob')
				const carol = global.find(row => row.login === 'carol')
				const popularity = Math.log10(2 + POPULARITY_OFFSET)
				expect(bob?.score).toBe(
					Math.round(SCORE_SCALE * Math.sqrt(PR_WEIGHT.selfMerged) * popularity)
				)
				expect(carol?.score).toBe(
					Math.round(SCORE_SCALE * Math.sqrt(PR_WEIGHT.merged) * popularity)
				)
				expect(poland).toMatchObject([
					{ rank: 1, login: 'carol', location: 'Gdańsk, Poland' },
				])
			}).pipe(
				Effect.provide(buildLayer(new Map([...dayFiles(), ...profileFiles()])))
			)
	)

	it.effect.each([9, 10])(
		'counts a lone contributor repository at the real-star boundary: %d',
		stars => {
			const files = new Map([
				...dayFiles(),
				...profileFiles(),
				[
					'seasons/2026-10/repos.json',
					JSON.stringify({
						season: seasonId,
						updatedAt: fetchedAt,
						repositories: {
							'big/lib': {
								repository: 'big/lib',
								stars,
								language: 'Rust',
								fetchedAt,
								missing: false,
							},
						},
					}),
				],
			])

			return Effect.gen(function* () {
				const { report, global } = yield* build
				expect(global.some(row => row.login === 'alice')).toBe(stars >= 10)
				expect(report.withoutCountedRepository).toBe(stars >= 10 ? 0 : 1)
			}).pipe(Effect.provide(buildLayer(files)))
		}
	)
})
