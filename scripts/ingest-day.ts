import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import {
	DEFAULT_CONCURRENCY,
	IngestDay,
} from '@modules/ingest/application/ingest-day.service'
import type { IngestMetrics } from '@modules/ingest/application/ingest-metrics'
import { ingestLayer } from '@modules/ingest/ingest.layer'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Console, Effect, Layer, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { parseHours } from './lib/parse-hours'

const argsSchema = Schema.Struct({
	date: isoDateSchema,
	concurrency: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
	out: Schema.NonEmptyString,
})

const readArgs = Effect.suspend(() => {
	const { values } = parseArgs({
		options: {
			date: { type: 'string' },
			hours: { type: 'string' },
			concurrency: { type: 'string' },
			out: { type: 'string', default: 'data' },
		},
	})

	return Effect.fromResult(parseHours(values.hours)).pipe(
		Effect.flatMap(hours =>
			Schema.decodeUnknownEffect(argsSchema)({
				date: values.date,
				concurrency: Number(values.concurrency ?? DEFAULT_CONCURRENCY),
				out: values.out,
			}).pipe(Effect.map(args => ({ ...args, hours })))
		)
	)
})

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const printMetrics = (metrics: IngestMetrics) =>
	Effect.gen(function* () {
		yield* Console.table(
			metrics.hours.map(hour => ({
				hour: hour.hour,
				downloaded: megabytes(hour.bytesDownloaded),
				lines: hour.linesSeen,
				preFiltered: hour.linesPreFiltered,
				decoded: hour.eventsDecoded,
				merges:
					hour.merges.merged + hour.merges.selfMerged + hour.merges.ownRepo,
				stars: hour.starEvents,
				time: seconds(hour.durationMs),
			}))
		)
		yield* Console.table({
			date: metrics.date,
			downloaded: megabytes(metrics.bytesDownloaded),
			linesSeen: metrics.linesSeen,
			linesPreFiltered: metrics.linesPreFiltered,
			eventsDecoded: metrics.eventsDecoded,
			invalidLines: metrics.invalidLines,
			ignoredEvents: metrics.ignoredEvents,
			botEvents: metrics.botEvents,
			mergedBySomeoneElse: metrics.merges.merged,
			selfMerged: metrics.merges.selfMerged,
			ownRepo: metrics.merges.ownRepo,
			mergesWithoutMerger: metrics.mergesWithoutMerger,
			starEvents: metrics.starEvents,
			contributionRows: metrics.contributionRows,
			repositories: metrics.repositories,
			output: metrics.output.location,
			outputSize: megabytes(metrics.output.bytes),
			wallTime: seconds(metrics.durationMs),
			peakRss: megabytes(metrics.peakRssBytes),
		})
	})

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const metrics = yield* Effect.gen(function* () {
		const ingestDay = yield* IngestDay

		return yield* ingestDay.ingest(args.date, {
			hours: args.hours,
			concurrency: args.concurrency,
		})
	}).pipe(
		Effect.provide(
			ingestLayer({ outDirectory: args.out }).pipe(
				Layer.provide(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer))
			)
		)
	)

	yield* printMetrics(metrics)
})

BunRuntime.runMain(program)
