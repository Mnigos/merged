import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import { MergeDayParts } from '@modules/ingest/application/merge-day-parts.service'
import { toMergeDayPartsLayer } from '@modules/ingest/ingest.layer'
import { isoDateSchema } from '@shared/schema/iso-date'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { Effect, Layer, Schema } from 'effect'
import { parsePartLabels } from './lib/part-labels'
import { printMergedDay } from './lib/reports'
import {
	STORAGE_OPTION,
	storageKindSchema,
	toStorageLayer,
} from './lib/storage-layer'

const argsSchema = Schema.Struct({
	date: isoDateSchema,
	storage: storageKindSchema,
	data: Schema.NonEmptyString,
	fromDirectory: Schema.NonEmptyString,
})

const readArgs = Effect.suspend(() => {
	const { values } = parseArgs({
		options: {
			date: { type: 'string' },
			parts: { type: 'string' },
			storage: STORAGE_OPTION,
			data: { type: 'string', default: 'data' },
			'from-directory': { type: 'string', default: 'data' },
		},
	})

	return Effect.gen(function* () {
		const labels = yield* Effect.fromResult(parsePartLabels(values.parts))
		const args = yield* Schema.decodeUnknownEffect(argsSchema)({
			date: values.date,
			storage: values.storage,
			data: values.data,
			fromDirectory: values['from-directory'],
		})

		return { ...args, labels }
	})
})

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const report = yield* Effect.gen(function* () {
		return yield* (yield* MergeDayParts).run({
			date: args.date,
			labels: args.labels,
		})
	}).pipe(
		Effect.provide(
			toMergeDayPartsLayer(localFileJsonStorageLayer(args.fromDirectory)).pipe(
				Layer.provide(
					toStorageLayer({ storage: args.storage, dataDirectory: args.data })
				),
				Layer.provide(BunServices.layer)
			)
		)
	)

	yield* printMergedDay(report)
})

BunRuntime.runMain(program)
