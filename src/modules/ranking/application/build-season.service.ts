import { DailyAggregates } from '@modules/ingest/application/daily-aggregates.service'
import type { DayStoreError } from '@modules/ingest/application/day-store.error'
import { isBot } from '@shared/github/bots.helper'
import { daysInSeason, type SeasonId } from '@shared/schema/season-id.schema'
import { Clock, Context, Duration, Effect, Layer, Option } from 'effect'
import { buildBoards } from '../domain/boards.helper'
import {
	DEFAULT_CANDIDATE_CONTRIBUTORS,
	selectCandidates,
} from '../domain/candidates.model'
import { scoreSeason } from '../domain/score-season.helper'
import {
	toSeasonIndexEntry,
	upsertSeasonIndex,
} from '../domain/season-index.helper'
import {
	addDay,
	createSeasonAccumulator,
	finishSeason,
	type SeasonAccumulator,
} from '../domain/season.model'
import { buildShards } from '../domain/shards.helper'
import {
	toBuildSeasonReport,
	type BuildSeasonReport,
} from './build-season.report'
import type { EnrichmentSourceError } from './enrichment-source.error'
import { EnrichmentSource } from './enrichment-source.port'
import type { SeasonStoreError } from './season-store.error'
import { SeasonStore } from './season-store.port'

/** Shard files written at the same time. */
export const SHARD_WRITE_CONCURRENCY = 8

/** What a build writes: every file, or only the candidates for enrichment. */
export type BuildSeasonPublish = 'all' | 'candidatesOnly'

export interface BuildSeasonOptions {
	/** Contributors selected as candidates for enrichment. */
	readonly candidateContributors?: number
	/** `candidatesOnly` scores and writes only `candidates.json`; `all` by default. */
	readonly publish?: BuildSeasonPublish
}

export interface BuildSeasonShape {
	readonly run: (
		seasonId: SeasonId,
		options?: BuildSeasonOptions
	) => Effect.Effect<
		BuildSeasonReport,
		DayStoreError | EnrichmentSourceError | SeasonStoreError
	>
}

/**
 * Scores a season from its daily aggregates, read one at a time in date order
 * and folded into the season so only one day is in memory, and writes every file the website
 * reads in this order: candidates, all 128 shards, boards, and the season index
 * last, so a failure mid-run leaves boards and index on the previous build as
 * far as possible. With `publish: 'candidatesOnly'` it writes only the
 * candidates, for a scoring pass 1 whose shards, boards and index pass 2
 * replaces anyway. Builds run one at a time; a failed build is repaired by
 * rerunning it.
 */
export class BuildSeason extends Context.Service<
	BuildSeason,
	BuildSeasonShape
>()('ranking/BuildSeason') {
	static readonly layer = Layer.effect(
		BuildSeason,
		Effect.gen(function* () {
			const dailyAggregates = yield* DailyAggregates
			const enrichmentSource = yield* EnrichmentSource
			const store = yield* SeasonStore

			const addDays = Effect.fn('BuildSeason.addDays')(function* (
				accumulator: SeasonAccumulator
			) {
				for (const date of daysInSeason(accumulator.seasonId)) {
					const day = yield* dailyAggregates.read(date)
					if (Option.isSome(day)) addDay(accumulator, day.value)
				}

				return finishSeason(accumulator)
			})

			const run = Effect.fn('BuildSeason.run')(function* (
				seasonId: SeasonId,
				{
					candidateContributors = DEFAULT_CANDIDATE_CONTRIBUTORS,
					publish = 'all',
				}: BuildSeasonOptions = {}
			) {
				const [duration, result] = yield* Effect.timed(
					Effect.gen(function* () {
						const now = new Date(yield* Clock.currentTimeMillis)
						const computedAt = now.toISOString()
						const enrichment = yield* enrichmentSource.read(seasonId)
						const season = yield* addDays(
							createSeasonAccumulator({
								seasonId,
								isBotLogin: login =>
									isBot(login) ||
									enrichment.contributors.get(login)?.isBot === true,
							})
						)
						const scored = scoreSeason(season, enrichment)
						const candidates = selectCandidates(
							{ season, scored },
							{
								contributors: candidateContributors,
							}
						)
						const candidatesWrite = yield* store.writeCandidates({
							season: seasonId,
							computedAt,
							...candidates,
						})
						const entry = toSeasonIndexEntry({ season, scored, now })
						const built = {
							season,
							scored,
							candidates,
							publish,
							status: entry.status,
							missingDays: entry.missingDays,
						}
						if (publish === 'candidatesOnly')
							return { ...built, writes: [candidatesWrite] }

						const boards = buildBoards({
							season,
							scored,
							enrichment,
							computedAt,
						})
						const shards = buildShards({
							seasonId,
							scored,
							polandRanks: boards.polandRanks,
							enrichment,
							computedAt,
						})

						const fileWrites = [
							candidatesWrite,
							...(yield* Effect.forEach(
								shards,
								([shardKey, shard]) => store.writeShard(shardKey, shard),
								{ concurrency: SHARD_WRITE_CONCURRENCY }
							)),
							yield* store.writeBoard(boards.global),
							yield* store.writeBoard(boards.poland),
							yield* store.writeRepositoryBoard(boards.repositories),
						]
						const index = upsertSeasonIndex(
							Option.getOrUndefined(yield* store.readIndex()),
							entry
						)

						return {
							...built,
							writes: [...fileWrites, yield* store.writeIndex(index)],
						}
					})
				)
				const report = toBuildSeasonReport({
					...result,
					durationMs: Duration.toMillis(duration),
				})
				yield* Effect.logInfo('season built').pipe(
					Effect.annotateLogs({
						season: report.season,
						published: report.published,
						days: report.daysIncluded.length,
						contributors: report.contributors,
						ms: report.durationMs,
					})
				)

				return report
			})

			return { run }
		})
	)
}
