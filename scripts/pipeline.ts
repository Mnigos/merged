import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import { DailyAggregates } from '@modules/ingest/application/daily-aggregates.service'
import { IngestDay } from '@modules/ingest/application/ingest-day.service'
import { ingestLayer } from '@modules/ingest/ingest.layer'
import { Enrich } from '@modules/profiles/application/enrich.service'
import { profilesLayer } from '@modules/profiles/profiles.layer'
import { BuildSeason } from '@modules/ranking/application/build-season.service'
import { Candidates } from '@modules/ranking/application/candidates.service'
import { candidatesLayer, rankingLayer } from '@modules/ranking/ranking.layer'
import { githubGraphqlHttpLayer } from '@shared/github/github-graphql-http'
import { isoDateSchema, type IsoDate } from '@shared/schema/iso-date'
import { seasonIdSchema, type SeasonId } from '@shared/schema/season-id'
import { writeThroughJsonStorageLayer } from '@shared/storage/write-through-json-storage'
import { Clock, Console, Effect, Layer, Option, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { closingSeasonOf, toDayRange, yesterdayOf } from './lib/pipeline-dates'
import {
	printEnrichReport,
	printIngestMetrics,
	printSeasonReport,
} from './lib/reports'
import {
	STORAGE_OPTION,
	storageKindSchema,
	toStorageLayer,
	type StorageLayerOptions,
} from './lib/storage-layer'

const argsSchema = Schema.Struct({
	from: isoDateSchema,
	date: isoDateSchema,
	season: seasonIdSchema,
	storage: storageKindSchema,
	data: Schema.NonEmptyString,
	skipExisting: Schema.Boolean,
})

const readArgs = Effect.gen(function* () {
	const { values } = parseArgs({
		options: {
			date: { type: 'string' },
			from: { type: 'string' },
			season: { type: 'string' },
			storage: STORAGE_OPTION,
			data: { type: 'string', default: 'data' },
			'skip-existing': { type: 'boolean', default: true },
		},
		allowNegative: true,
	})
	const date = values.date ?? yesterdayOf(yield* Clock.currentTimeMillis)
	const args = yield* Schema.decodeUnknownEffect(argsSchema)({
		from: values.from ?? date,
		date,
		season: values.season ?? date.slice(0, 7),
		storage: values.storage,
		data: values.data,
		skipExisting: values['skip-existing'],
	})
	if (args.from > args.date)
		return yield* Effect.fail(
			new Error(`--from ${args.from} is after --date ${args.date}`)
		)

	return args
})

function ingestDays(days: readonly IsoDate[], skipExisting: boolean) {
	return Effect.gen(function* () {
		const dailyAggregates = yield* DailyAggregates
		const ingestDay = yield* IngestDay
		for (const day of days) {
			if (skipExisting && Option.isSome(yield* dailyAggregates.read(day))) {
				yield* Console.log(`ingest-day ${day}: already ingested, skipping`)
				continue
			}
			yield* Console.log(`ingest-day ${day}`)
			yield* printIngestMetrics(yield* ingestDay.ingest(day))
		}
	})
}

function rankSeason(season: SeasonId) {
	return Effect.gen(function* () {
		const buildSeason = yield* BuildSeason
		yield* Console.log(`build-ranking ${season}, pass 1`)
		yield* printSeasonReport(yield* buildSeason.run(season))

		yield* Console.log(`enrich ${season}`)
		const candidates = yield* (yield* Candidates)
			.read(season)
			.pipe(
				Effect.flatMap(found =>
					Option.isSome(found)
						? Effect.succeed(found.value)
						: Effect.fail(new Error(`No candidates for ${season} after pass 1`))
				)
			)
		yield* printEnrichReport(yield* (yield* Enrich).run(season, candidates))

		yield* Console.log(`build-ranking ${season}, pass 2`)
		yield* printSeasonReport(yield* buildSeason.run(season))
	})
}

/**
 * Every module over one write-through storage, so each step reads what the
 * previous steps wrote even when Blob's CDN still serves older files.
 */
const toPipelineLayer = (storage: StorageLayerOptions) =>
	Layer.mergeAll(
		ingestLayer,
		rankingLayer,
		candidatesLayer,
		profilesLayer
	).pipe(
		Layer.provide(
			Layer.mergeAll(
				writeThroughJsonStorageLayer.pipe(
					Layer.provide(toStorageLayer(storage))
				),
				githubGraphqlHttpLayer
			)
		),
		Layer.provide(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer))
	)

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const closingSeason = closingSeasonOf(args.date)
	const seasons =
		closingSeason && closingSeason !== args.season
			? [closingSeason, args.season]
			: [args.season]

	yield* Effect.gen(function* () {
		yield* ingestDays(toDayRange(args.from, args.date), args.skipExisting)
		for (const season of seasons) yield* rankSeason(season)
	}).pipe(
		Effect.provide(
			toPipelineLayer({ storage: args.storage, dataDirectory: args.data })
		)
	)
})

BunRuntime.runMain(program)
