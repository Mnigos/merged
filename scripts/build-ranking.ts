import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import { BuildSeason } from '@modules/ranking/application/build-season.service'
import { rankingLayer } from '@modules/ranking/ranking.layer'
import { seasonIdOf, seasonIdSchema } from '@shared/schema/season-id'
import { Clock, Effect, Layer, Schema } from 'effect'
import { printSeasonReport } from './lib/reports'
import {
	STORAGE_OPTION,
	storageKindSchema,
	toStorageLayer,
} from './lib/storage-layer'

const argsSchema = Schema.Struct({
	season: seasonIdSchema,
	storage: storageKindSchema,
	data: Schema.NonEmptyString,
})

const readArgs = Effect.gen(function* () {
	const { values } = parseArgs({
		options: {
			season: { type: 'string' },
			storage: STORAGE_OPTION,
			data: { type: 'string', default: 'data' },
		},
	})
	const now = new Date(yield* Clock.currentTimeMillis)

	return yield* Schema.decodeUnknownEffect(argsSchema)({
		season: values.season ?? seasonIdOf(now),
		storage: values.storage,
		data: values.data,
	})
})

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const report = yield* Effect.gen(function* () {
		const buildSeason = yield* BuildSeason

		return yield* buildSeason.run(args.season)
	}).pipe(
		Effect.provide(
			rankingLayer.pipe(
				Layer.provide(
					toStorageLayer({ storage: args.storage, dataDirectory: args.data })
				),
				Layer.provide(BunServices.layer)
			)
		)
	)

	yield* printSeasonReport(report)
})

BunRuntime.runMain(program)
