import { describe, expect, it } from '@effect/vitest'
import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { daysInSeason, seasonIdSchema } from '@shared/schema/season-id.schema'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory.storage'
import { Effect, Layer, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import type { SeasonEnrichment } from '../domain/enrichment.model'
import { emptyEnrichment } from '../domain/enrichment.model'
import { boardFileSchema } from '../domain/files/board.file'
import { seasonIndexSchema } from '../domain/files/season-index.file'
import { shardFileSchema } from '../domain/files/shard.file'
import { SHARD_COUNT, SHARD_KEYS, shardKeyOf } from '../domain/shards.helper'
import { jsonSeasonStoreLayer } from '../infrastructure/json-season.store'
import { inMemoryEnrichmentSourceLayer } from '../testing/enrichment-source.mock'
import dayOne from '../testing/fixtures/day-2026-10-01.json?raw'
import dayThree from '../testing/fixtures/day-2026-10-03.json?raw'
import { login, seasonId, toDay, toEnrichment } from '../testing/season.mock'
import { BuildSeason } from './build-season.service'
import { SeasonStore } from './season-store.port'

const NOW = Date.parse('2026-10-04T06:00:00Z')

class RecordingFiles extends Map<string, string> {
	readonly writes: string[] = []

	override set(path: string, text: string) {
		this.writes.push(path)
		return super.set(path, text)
	}
}

const previousSeason = {
	id: seasonIdSchema.make('2026-09'),
	status: 'final',
	daysIncluded: 30,
	daysInMonth: 30,
	missingDays: [],
	computedAt: '2026-10-01T06:00:00.000Z',
	contributors: 7,
	repositories: 3,
	mergedPullRequests: 12,
} as const

const seededFiles = () =>
	new Map([
		['days/2026-10-01.json', dayOne],
		['days/2026-10-03.json', dayThree],
		[
			'seasons/index.json',
			JSON.stringify({ latest: '2026-09', seasons: [previousSeason] }),
		],
	])

const enrichment = toEnrichment({
	contributors: {
		robo: { isBot: true },
		dave: { name: 'Dave', location: 'Wrocław' },
	},
	repositories: { 'acme/widgets': { stars: 1200, language: 'Go' } },
	mergers: { 'acme/widgets#5': 'alice', 'acme/widgets#6': 'erin' },
})

const buildLayer = (files: Map<string, string>, source: SeasonEnrichment) =>
	BuildSeason.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(
				jsonSeasonStoreLayer,
				dailyAggregatesLayer,
				inMemoryEnrichmentSourceLayer(source)
			)
		),
		Layer.provide(inMemoryJsonStorageLayer(files))
	)

const decodeJson = <TValue, TEncoded>(
	schema: Schema.Codec<TValue, TEncoded>,
	text: string | undefined
) => Schema.decodeUnknownSync(Schema.fromJsonString(schema))(text)

describe('BuildSeason', () => {
	it.effect('scores the season and writes every file, the index last', () => {
		const files = new RecordingFiles()
		for (const [path, text] of seededFiles()) files.set(path, text)
		files.writes.length = 0

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			const buildSeason = yield* BuildSeason
			const report = yield* buildSeason.run(seasonId)

			expect(report).toMatchObject({
				season: '2026-10',
				status: 'provisional',
				daysIncluded: ['2026-10-01', '2026-10-03'],
				missingDays: ['2026-10-02'],
				contributors: 4,
				excludedBots: 1,
				repositories: 3,
				mergedPullRequests: 8,
				candidates: { contributors: 4, repositories: 3, pullRequests: 8 },
				filesWritten: 1 + 2 + SHARD_COUNT + 1,
			})
			expect(report.top.map(row => row.login)).toEqual([
				'alice',
				'dave',
				'bob',
				'carol',
			])
			expect(report.top[0]).toMatchObject({
				rank: 1,
				mergedPullRequests: 4,
				repositories: 2,
				topRepository: 'acme/widgets',
			})
			expect(report.bytesWritten).toBeGreaterThan(0)
			expect(files.writes.at(-1)).toBe('seasons/index.json')
			expect(files.writes).toHaveLength(report.filesWritten)
			expect(report.bytesWritten).toBe(
				[...files]
					.filter(([path]) => path.startsWith('seasons/'))
					.reduce((total, [, text]) => total + Buffer.byteLength(text), 0)
			)
			expect(
				[...files.keys()].filter(path => path.includes('/shards/')).toSorted()
			).toEqual(SHARD_KEYS.map(key => `seasons/2026-10/shards/${key}.json`))
		}).pipe(Effect.provide(buildLayer(files, enrichment)))
	})

	it.effect(
		'preserves other seasons in the index and points latest at the newest',
		() => {
			const files = seededFiles()

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				yield* (yield* BuildSeason).run(seasonId)

				expect(
					decodeJson(seasonIndexSchema, files.get('seasons/index.json'))
				).toEqual({
					latest: '2026-10',
					seasons: [
						{
							id: '2026-10',
							status: 'provisional',
							daysIncluded: 2,
							daysInMonth: 31,
							missingDays: ['2026-10-02'],
							computedAt: '2026-10-04T06:00:00.000Z',
							contributors: 4,
							repositories: 3,
							mergedPullRequests: 8,
							excludedBots: 1,
							countries: [],
						},
						previousSeason,
					],
				})
			}).pipe(Effect.provide(buildLayer(files, enrichment)))
		}
	)

	it.effect(
		'rebuilding an older season replaces its entry without losing newer seasons',
		() => {
			const files = seededFiles()

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const buildSeason = yield* BuildSeason
				yield* buildSeason.run(seasonId)
				const before = decodeJson(
					seasonIndexSchema,
					files.get('seasons/index.json')
				)
				yield* buildSeason.run(seasonIdSchema.make('2026-09'))
				const after = decodeJson(
					seasonIndexSchema,
					files.get('seasons/index.json')
				)

				expect(after.latest).toBe('2026-10')
				expect(after.seasons.map(entry => entry.id)).toEqual([
					'2026-10',
					'2026-09',
				])
				expect(after.seasons[0]).toEqual(before.seasons[0])
				expect(after.seasons[1]).toMatchObject({
					id: '2026-09',
					status: 'provisional',
					daysIncluded: 0,
					contributors: 0,
				})
			}).pipe(Effect.provide(buildLayer(files, emptyEnrichment)))
		}
	)

	it.effect(
		'applies enrichment: bots, mergers, real stars and locations',
		() => {
			const files = seededFiles()

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				yield* (yield* BuildSeason).run(seasonId)
				const store = yield* SeasonStore
				const global = Option.getOrThrow(
					yield* store.readBoard(seasonId, 'global')
				)
				const shardEntry = (name: string) =>
					store
						.readShard(seasonId, shardKeyOf(name))
						.pipe(
							Effect.map(shard => Option.getOrThrow(shard).entries[login(name)])
						)

				expect(global.rows.map(row => row.login)).not.toContain('robo')
				expect(global.rows[0]).toMatchObject({
					login: 'alice',
					mergedPullRequests: 3,
					selfMergedPullRequests: 1,
				})
				expect(global.rows[1]).toMatchObject({
					login: 'dave',
					name: 'Dave',
					location: 'Wrocław',
				})
				expect(files.has('seasons/2026-10/tabs/country-pl.json')).toBe(false)
				expect(yield* shardEntry('robo')).toMatchObject({
					excluded: 'bot',
					rank: null,
				})
				expect(yield* shardEntry('dave')).toMatchObject({
					boards: { country: null },
					excluded: null,
				})
				expect(
					Option.getOrThrow(yield* store.readRepositoryBoard(seasonId)).rows[0]
				).toEqual({
					rank: 1,
					repository: 'acme/widgets',
					contributors: 3,
					mergedPullRequests: 5,
					starsInSeason: 20,
					stars: 1200,
					language: 'Go',
				})
			}).pipe(Effect.provide(buildLayer(files, enrichment)))
		}
	)

	it.effect('writes candidates for enrichment without enrichment', () => {
		const files = seededFiles()

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			yield* (yield* BuildSeason).run(seasonId, { candidateContributors: 1 })
			const store = yield* SeasonStore

			expect(Option.getOrThrow(yield* store.readCandidates(seasonId))).toEqual({
				season: '2026-10',
				computedAt: '2026-10-04T06:00:00.000Z',
				contributors: ['alice'],
				repositories: ['acme/widgets', 'tiny/tool'],
				pullRequests: [
					{ repository: 'acme/widgets', number: 1, author: 'alice' },
					{ repository: 'acme/widgets', number: 2, author: 'alice' },
					{ repository: 'acme/widgets', number: 5, author: 'alice' },
					{ repository: 'tiny/tool', number: 3, author: 'alice' },
				],
			})
			expect(yield* store.readBoard(seasonId, 'country-pl')).toEqual(
				Option.none()
			)
		}).pipe(Effect.provide(buildLayer(files, emptyEnrichment)))
	})

	it.effect(
		'writes a board for every country from 10 contributors and lists it in the index',
		() => {
			const names = Array.from(
				{ length: 12 },
				(_, index) => `dev-${String(index).padStart(2, '0')}`
			)
			const files = new Map([
				[
					'days/2026-10-01.json',
					JSON.stringify(
						toDay({
							date: '2026-10-01',
							rows: names.map((author, index) => ({
								author,
								repository: 'org/repo',
								merged: 20 - index,
							})),
							stars: { 'org/repo': 3 },
						})
					),
				],
			])
			const locations = toEnrichment({
				contributors: Object.fromEntries(
					names.map((name, index) => [
						name,
						{ location: index < 10 ? 'Kraków, Poland' : 'Lisbon' },
					])
				),
			})

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* BuildSeason).run(seasonId)
				const store = yield* SeasonStore
				const poland = decodeJson(
					boardFileSchema,
					files.get('seasons/2026-10/tabs/country-pl.json')
				)

				expect(report.filesWritten).toBe(1 + 3 + SHARD_COUNT + 1)
				expect(poland).toMatchObject({
					board: 'country',
					country: {
						code: 'pl',
						name: 'Poland',
						flag: '🇵🇱',
						contributors: 10,
					},
					contributors: 10,
				})
				expect(poland.rows.map(row => [row.rank, row.login])).toEqual(
					names.slice(0, 10).map((name, index) => [index + 1, name])
				)
				expect(files.has('seasons/2026-10/tabs/country-pt.json')).toBe(false)
				expect(
					decodeJson(seasonIndexSchema, files.get('seasons/index.json'))
						.seasons[0]?.countries
				).toEqual([
					{ code: 'pl', name: 'Poland', flag: '🇵🇱', contributors: 10 },
				])
				expect(
					Option.getOrThrow(
						yield* store.readShard(seasonId, shardKeyOf('dev-03'))
					).entries['dev-03']?.boards
				).toEqual({ country: { code: 'pl', rank: 4 } })
				expect(
					Option.getOrThrow(
						yield* store.readShard(seasonId, shardKeyOf('dev-11'))
					).entries['dev-11']?.boards
				).toEqual({ country: null })
			}).pipe(Effect.provide(buildLayer(files, locations)))
		}
	)

	it.effect('builds an empty provisional season when no day exists yet', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)
			const report = yield* (yield* BuildSeason).run(seasonId)

			expect(report).toMatchObject({
				daysIncluded: [],
				missingDays: ['2026-10-01', '2026-10-02', '2026-10-03'],
				contributors: 0,
				status: 'provisional',
			})
			expect(
				decodeJson(seasonIndexSchema, files.get('seasons/index.json')).latest
			).toBe('2026-10')
			expect(
				[...files.keys()].filter(path => path.includes('/shards/')).toSorted()
			).toEqual(SHARD_KEYS.map(key => `seasons/2026-10/shards/${key}.json`))
			for (const key of SHARD_KEYS)
				expect(
					decodeJson(
						shardFileSchema,
						files.get(`seasons/2026-10/shards/${key}.json`)
					)
				).toEqual({
					season: seasonId,
					computedAt: '2026-10-04T06:00:00.000Z',
					entries: {},
				})
		}).pipe(Effect.provide(buildLayer(files, emptyEnrichment)))
	})

	it.effect.each([
		{
			now: '2026-09-30T23:59:59.999Z',
			omitted: undefined,
			status: 'provisional',
		},
		{ now: '2026-10-01T00:00:00.000Z', omitted: undefined, status: 'final' },
		{
			now: '2026-10-04T06:00:00.000Z',
			omitted: '2026-09-15',
			status: 'provisional',
		},
	])(
		'requires all days and month end for final status: %j',
		({ now, omitted, status }) => {
			const pastSeason = seasonIdSchema.make('2026-09')
			const included = daysInSeason(pastSeason).filter(date => date !== omitted)
			const files = new Map(
				included.map(date => [
					`days/${date}.json`,
					JSON.stringify(toDay({ date })),
				])
			)

			return Effect.gen(function* () {
				yield* TestClock.setTime(Date.parse(now))
				const report = yield* (yield* BuildSeason).run(pastSeason)

				expect(report).toMatchObject({
					status,
					missingDays: omitted ? [omitted] : [],
					daysIncluded: included,
				})
				expect(
					decodeJson(seasonIndexSchema, files.get('seasons/index.json'))
						.seasons[0]
				).toMatchObject({
					id: pastSeason,
					status,
					daysIncluded: included.length,
					missingDays: omitted ? [omitted] : [],
				})
			}).pipe(Effect.provide(buildLayer(files, emptyEnrichment)))
		}
	)

	it.effect('fails on a corrupt day without writing the index', () => {
		const files = seededFiles()
		files.set('days/2026-10-02.json', '{"date":')

		return Effect.gen(function* () {
			yield* TestClock.setTime(NOW)

			expect(
				yield* Effect.flip((yield* BuildSeason).run(seasonId))
			).toMatchObject({ _tag: 'DayStoreError', date: '2026-10-02' })
			expect(
				decodeJson(seasonIndexSchema, files.get('seasons/index.json')).latest
			).toBe('2026-09')
			expect([...files.keys()].some(path => path.includes('2026-10/'))).toBe(
				false
			)
		}).pipe(Effect.provide(buildLayer(files, enrichment)))
	})

	it.effect(
		'excludes an enrichment-only bot before counting repository contributors',
		() => {
			const files = new Map([
				[
					'days/2026-10-01.json',
					JSON.stringify(
						toDay({
							date: '2026-10-01',
							rows: [
								{ author: 'alice', repository: 'solo/tool', pullRequests: [1] },
								{ author: 'robo', repository: 'solo/tool', pullRequests: [2] },
							],
						})
					),
				],
			])

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* BuildSeason).run(seasonId)
				const store = yield* SeasonStore
				expect(report).toMatchObject({
					contributors: 0,
					excludedBots: 1,
					withoutCountedRepository: 1,
					mergedPullRequests: 1,
				})
				expect(
					Option.getOrThrow(yield* store.readBoard(seasonId, 'global')).rows
				).toEqual([])
				expect(
					Option.getOrThrow(yield* store.readRepositoryBoard(seasonId)).rows
				).toMatchObject([
					{ repository: 'solo/tool', contributors: 1, mergedPullRequests: 1 },
				])
				expect(
					Option.getOrThrow(
						yield* store.readShard(seasonId, shardKeyOf('robo'))
					).entries['robo']
				).toMatchObject({ excluded: 'bot', rank: null })
				expect(
					Option.getOrThrow(
						yield* store.readShard(seasonId, shardKeyOf('alice'))
					).entries['alice']
				).toMatchObject({ excluded: 'noCountedRepository', rank: null })
			}).pipe(
				Effect.provide(
					buildLayer(
						files,
						toEnrichment({
							contributors: { robo: { isBot: true, location: 'Warsaw' } },
						})
					)
				)
			)
		}
	)

	it.effect(
		'writes only the candidates with publish candidatesOnly and reports it',
		() => {
			const files = new RecordingFiles()
			for (const [path, text] of seededFiles()) files.set(path, text)
			files.writes.length = 0
			const indexBefore = files.get('seasons/index.json')

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const report = yield* (yield* BuildSeason).run(seasonId, {
					publish: 'candidatesOnly',
				})

				expect(report).toMatchObject({
					published: 'candidatesOnly',
					status: 'provisional',
					missingDays: ['2026-10-02'],
					contributors: 4,
					candidates: { contributors: 4, repositories: 3, pullRequests: 8 },
					filesWritten: 1,
				})
				expect(files.writes).toEqual(['seasons/2026-10/candidates.json'])
				expect(report.bytesWritten).toBe(
					Buffer.byteLength(files.get('seasons/2026-10/candidates.json') ?? '')
				)
				expect(files.get('seasons/index.json')).toBe(indexBefore)
			}).pipe(Effect.provide(buildLayer(files, enrichment)))
		}
	)

	it.effect.each([undefined, 'all'] as const)(
		'publishes every file with publish %s and reports all',
		publish => {
			const files = seededFiles()

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				const buildSeason = yield* BuildSeason
				const candidatesOnly = yield* buildSeason.run(seasonId, {
					publish: 'candidatesOnly',
				})
				const candidatesBefore = files.get('seasons/2026-10/candidates.json')
				const all = yield* buildSeason.run(seasonId, { publish })

				expect(all.published).toBe('all')
				expect(all.filesWritten).toBe(1 + 2 + SHARD_COUNT + 1)
				expect(all.candidates).toEqual(candidatesOnly.candidates)
				expect(all.top).toEqual(candidatesOnly.top)
				expect(files.get('seasons/2026-10/candidates.json')).toBe(
					candidatesBefore
				)
				expect(
					[...files.keys()]
						.filter(path => path.startsWith('seasons/'))
						.toSorted()
				).toEqual(
					[
						'seasons/2026-10/candidates.json',
						...SHARD_KEYS.map(key => `seasons/2026-10/shards/${key}.json`),
						'seasons/2026-10/tabs/global.json',
						'seasons/2026-10/tabs/repositories.json',
						'seasons/index.json',
					].toSorted()
				)
			}).pipe(Effect.provide(buildLayer(files, enrichment)))
		}
	)
})
