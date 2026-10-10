import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import type { BuildSeasonReport } from '@modules/ranking/application/build-season-report'
import { BuildSeason } from '@modules/ranking/application/build-season.service'
import { rankingLayer } from '@modules/ranking/ranking.layer'
import { seasonIdOf, seasonIdSchema } from '@shared/schema/season-id'
import { Clock, Console, Effect, Layer, Schema } from 'effect'

const argsSchema = Schema.Struct({
	season: seasonIdSchema,
	data: Schema.NonEmptyString,
})

const readArgs = Effect.gen(function* () {
	const { values } = parseArgs({
		options: {
			season: { type: 'string' },
			data: { type: 'string', default: 'data' },
		},
	})
	const now = new Date(yield* Clock.currentTimeMillis)

	return yield* Schema.decodeUnknownEffect(argsSchema)({
		season: values.season ?? seasonIdOf(now),
		data: values.data,
	})
})

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const printReport = (report: BuildSeasonReport) =>
	Effect.gen(function* () {
		yield* Console.table(report.top)
		yield* Console.table({
			season: report.season,
			status: report.status,
			daysIncluded: report.daysIncluded.length,
			missingDays: report.missingDays.join(', ') || 'none',
			contributors: report.contributors,
			excludedBots: report.excludedBots,
			withoutCountedRepository: report.withoutCountedRepository,
			repositories: report.repositories,
			mergedPullRequests: report.mergedPullRequests,
			candidateContributors: report.candidates.contributors,
			candidateRepositories: report.candidates.repositories,
			candidatePullRequests: report.candidates.pullRequests,
			filesWritten: report.filesWritten,
			written: megabytes(report.bytesWritten),
			wallTime: seconds(report.durationMs),
		})
	})

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const report = yield* Effect.gen(function* () {
		const buildSeason = yield* BuildSeason

		return yield* buildSeason.run(args.season)
	}).pipe(
		Effect.provide(
			rankingLayer({ dataDirectory: args.data }).pipe(
				Layer.provide(BunServices.layer)
			)
		)
	)

	yield* printReport(report)
})

BunRuntime.runMain(program)
