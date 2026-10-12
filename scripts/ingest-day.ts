import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import { DailyAggregates } from '@modules/ingest/application/daily-aggregates.service'
import {
	DEFAULT_CONCURRENCY,
	IngestDay,
} from '@modules/ingest/application/ingest-day.service'
import type { IngestMetrics } from '@modules/ingest/application/ingest-metrics'
import { toIngestLayer } from '@modules/ingest/ingest.layer'
import {
	ingestSourceConfig,
	ingestSourceKindSchema,
} from '@shared/config/ingest-source'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Console, Effect, Layer, Option, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { InvalidPartsError } from './lib/invalid-parts.error'
import { parseHours } from './lib/parse-hours'
import { toPartLabel } from './lib/part-labels'
import { printIngestMetrics } from './lib/reports'
import {
	STORAGE_OPTION,
	storageKindSchema,
	toStorageLayer,
} from './lib/storage-layer'

const argsSchema = Schema.Struct({
	date: isoDateSchema,
	concurrency: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
	source: ingestSourceKindSchema,
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
			source: { type: 'string' },
			storage: STORAGE_OPTION,
			out: { type: 'string', default: 'data' },
			'skip-existing': { type: 'boolean', default: false },
			part: { type: 'boolean', default: false },
		},
	})

	return Effect.gen(function* () {
		const hours = yield* Effect.fromResult(parseHours(values.hours))
		const args = yield* Schema.decodeUnknownEffect(argsSchema)({
			date: values.date,
			concurrency: Number(values.concurrency ?? DEFAULT_CONCURRENCY),
			source: values.source ?? (yield* ingestSourceConfig),
			storage: values.storage,
			out: values.out,
			skipExisting: values['skip-existing'],
		})
		if (!values.part) return { ...args, hours, part: undefined }

		const part = yield* Effect.fromResult(toPartLabel(values.hours))
		if (args.storage !== 'local' || args.skipExisting)
			return yield* Effect.fail(
				new InvalidPartsError({
					input: `--storage ${args.storage}`,
					message: `--part writes the local file <out>/days/${args.date}.part-${part}.json for merge-day; use --storage local without --skip-existing`,
				})
			)

		return { ...args, hours, part }
	})
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
				part: args.part,
			})
		)
	}).pipe(
		Effect.provide(
			toIngestLayer(args.source).pipe(
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
