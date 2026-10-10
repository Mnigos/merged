import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import { DailyAggregates } from '@modules/ingest/application/daily-aggregates.service'
import {
	DEFAULT_CONCURRENCY,
	IngestDay,
} from '@modules/ingest/application/ingest-day.service'
import type { IngestMetrics } from '@modules/ingest/application/ingest-metrics'
import { ingestLayer } from '@modules/ingest/ingest.layer'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Console, Effect, Layer, Option, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { parseHours } from './lib/parse-hours'
import { printIngestMetrics } from './lib/reports'
import {
	STORAGE_OPTION,
	storageKindSchema,
	toStorageLayer,
} from './lib/storage-layer'

const argsSchema = Schema.Struct({
	date: isoDateSchema,
	concurrency: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
	storage: storageKindSchema,
	out: Schema.NonEmptyString,
	skipExisting: Schema.Boolean,
})

const readArgs = Effect.suspend(() => {
	const { values } = parseArgs({
		options: {
			date: { type: 'string' },
			hours: { type: 'string' },
			concurrency: { type: 'string' },
			storage: STORAGE_OPTION,
			out: { type: 'string', default: 'data' },
			'skip-existing': { type: 'boolean', default: false },
		},
	})

	return Effect.fromResult(parseHours(values.hours)).pipe(
		Effect.flatMap(hours =>
			Schema.decodeUnknownEffect(argsSchema)({
				date: values.date,
				concurrency: Number(values.concurrency ?? DEFAULT_CONCURRENCY),
				storage: values.storage,
				out: values.out,
				skipExisting: values['skip-existing'],
			}).pipe(Effect.map(args => ({ ...args, hours })))
		)
	)
})

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const metrics = yield* Effect.gen(function* () {
		if (args.skipExisting) {
			const existing = yield* (yield* DailyAggregates).read(args.date)
			if (Option.isSome(existing)) return Option.none<IngestMetrics>()
		}

		return Option.some(
			yield* (yield* IngestDay).ingest(args.date, {
				hours: args.hours,
				concurrency: args.concurrency,
			})
		)
	}).pipe(
		Effect.provide(
			ingestLayer.pipe(
				Layer.provide(
					Layer.mergeAll(
						toStorageLayer({ storage: args.storage, dataDirectory: args.out }),
						FetchHttpClient.layer
					)
				),
				Layer.provide(BunServices.layer)
			)
		)
	)

	yield* Option.match(metrics, {
		onNone: () => Console.log(`${args.date} already ingested, skipping`),
		onSome: printIngestMetrics,
	})
})

BunRuntime.runMain(program)
