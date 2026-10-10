import { describe, expect, it } from '@effect/vitest'
import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { daysInSeason, seasonIdSchema } from '@shared/schema/season-id'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import type { SeasonEnrichment } from '../domain/enrichment'
import { emptyEnrichment } from '../domain/enrichment'
import { boardFileSchema } from '../domain/files/board-file'
import { seasonIndexSchema } from '../domain/files/season-index-file'
import { shardFileSchema } from '../domain/files/shard-file'
import { SHARD_COUNT, SHARD_KEYS, shardKeyOf } from '../domain/shards'
import { jsonSeasonStoreLayer } from '../infrastructure/json-season-store'
import dayOne from '../testing/fixtures/day-2026-10-01.json?raw'
import dayThree from '../testing/fixtures/day-2026-10-03.json?raw'
import { inMemoryEnrichmentSourceLayer } from '../testing/in-memory-enrichment-source'
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
				mergedPullRequests: 10,
				candidates: { contributors: 4, repositories: 3, pullRequests: 8 },
				filesWritten: 1 + 3 + SHARD_COUNT + 1,
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
							mergedPullRequests: 10,
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
		'applies enrichment: bots, mergers, real stars and the Poland board',
		() => {
			const files = seededFiles()

			return Effect.gen(function* () {
				yield* TestClock.setTime(NOW)
				yield* (yield* BuildSeason).run(seasonId)
				const store = yield* SeasonStore
				const global = Option.getOrThrow(
					yield* store.readBoard(seasonId, 'global')
				)
				const poland = decodeJson(
					boardFileSchema,
					files.get('seasons/2026-10/tabs/poland.json')
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
				expect(poland.rows).toMatchObject([
					{ rank: 1, login: 'dave', name: 'Dave', location: 'Wrocław' },
				])
				expect(yield* shardEntry('robo')).toMatchObject({
					excluded: 'bot',
					rank: null,
				})
				expect(yield* shardEntry('dave')).toMatchObject({
					boards: { poland: 1 },
					excluded: null,
				})
				expect(
					Option.getOrThrow(yield* store.readRepositoryBoard(seasonId)).rows[0]
				).toEqual({
					rank: 1,
					repository: 'acme/widgets',
					contributors: 4,
					mergedPullRequests: 7,
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
				repositories: ['acme/gadgets', 'acme/widgets', 'tiny/tool'],
				pullRequests: [
					{ repository: 'acme/widgets', number: 1, author: 'alice' },
					{ repository: 'acme/widgets', number: 2, author: 'alice' },
					{ repository: 'acme/widgets', number: 5, author: 'alice' },
					{ repository: 'tiny/tool', number: 3, author: 'alice' },
				],
			})
			expect(
				Option.getOrThrow(yield* store.readBoard(seasonId, 'poland')).rows
			).toEqual([])
		}).pipe(Effect.provide(buildLayer(files, emptyEnrichment)))
	})

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
})
