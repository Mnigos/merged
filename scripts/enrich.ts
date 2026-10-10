import { parseArgs } from 'node:util'
import { BunRuntime, BunServices } from '@effect/platform-bun'
import type { EnrichKindReport } from '@modules/profiles/application/enrich-kind'
import type { EnrichReport } from '@modules/profiles/application/enrich-report'
import { Enrich } from '@modules/profiles/application/enrich.service'
import { DEFAULT_MAX_AGE_DAYS } from '@modules/profiles/domain/freshness'
import { profilesLayer } from '@modules/profiles/profiles.layer'
import { Candidates } from '@modules/ranking/application/candidates.service'
import { candidatesLayer } from '@modules/ranking/ranking.layer'
import { githubGraphqlHttpLayer } from '@shared/github/github-graphql-http'
import { seasonIdOf, seasonIdSchema } from '@shared/schema/season-id'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { Clock, Console, Effect, Layer, Option, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'

const limitSchema = Schema.optional(
	Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))
)

const argsSchema = Schema.Struct({
	season: seasonIdSchema,
	data: Schema.NonEmptyString,
	contributors: limitSchema,
	repositories: limitSchema,
	pullRequests: limitSchema,
	maxAgeDays: Schema.Number.pipe(
		Schema.check(Schema.isGreaterThanOrEqualTo(0))
	),
})

const toNumber = (value: string | undefined) =>
	value === undefined ? undefined : Number(value)

const readArgs = Effect.gen(function* () {
	const { values } = parseArgs({
		options: {
			season: { type: 'string' },
			data: { type: 'string', default: 'data' },
			contributors: { type: 'string' },
			repositories: { type: 'string' },
			'pull-requests': { type: 'string' },
			'max-age-days': { type: 'string' },
		},
	})
	const now = new Date(yield* Clock.currentTimeMillis)

	return yield* Schema.decodeUnknownEffect(argsSchema)({
		season: values.season ?? seasonIdOf(now),
		data: values.data,
		contributors: toNumber(values.contributors),
		repositories: toNumber(values.repositories),
		pullRequests: toNumber(values['pull-requests']),
		maxAgeDays: toNumber(values['max-age-days']) ?? DEFAULT_MAX_AGE_DAYS,
	})
})

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const toKindRow = (kind: EnrichKindReport) => ({
	requested: kind.requested,
	cached: kind.cached,
	fetched: kind.fetched,
	missing: kind.missing,
	failed: kind.failed,
	queries: kind.queries,
	cost: kind.cost,
	remaining: kind.remaining ?? '-',
	file: megabytes(kind.fileBytes),
})

const printReport = (report: EnrichReport) =>
	Effect.gen(function* () {
		yield* Console.table({
			repositories: toKindRow(report.repositories),
			contributors: toKindRow(report.contributors),
			pullRequests: toKindRow(report.pullRequests),
		})
		yield* Console.table({
			season: report.season,
			queries: report.queries,
			cost: report.cost,
			filesWritten: report.filesWritten,
			written: megabytes(report.bytesWritten),
			wallTime: seconds(report.durationMs),
		})
	})

const program = Effect.gen(function* () {
	const args = yield* readArgs
	const report = yield* Effect.gen(function* () {
		const candidates = yield* (yield* Candidates).read(args.season)
		if (Option.isNone(candidates))
			return yield* Effect.fail(
				new Error(
					`No candidates for ${args.season}; run build-ranking --season ${args.season} first`
				)
			)

		return yield* (yield* Enrich).run(args.season, candidates.value, {
			contributors: args.contributors,
			repositories: args.repositories,
			pullRequests: args.pullRequests,
			maxAgeDays: args.maxAgeDays,
		})
	}).pipe(
		Effect.provide(
			Layer.mergeAll(candidatesLayer, profilesLayer).pipe(
				Layer.provide(
					Layer.mergeAll(
						localFileJsonStorageLayer(args.data),
						githubGraphqlHttpLayer.pipe(Layer.provide(FetchHttpClient.layer))
					)
				),
				Layer.provide(BunServices.layer)
			)
		)
	)

	yield* printReport(report)
})

BunRuntime.runMain(program)
