import { DailyAggregates } from '@modules/ingest/application/daily-aggregates.service'
import type { DayStoreError } from '@modules/ingest/application/day-store.error'
import { isBot } from '@shared/github/bots'
import { daysInSeason, type SeasonId } from '@shared/schema/season-id'
import { Clock, Context, Duration, Effect, Layer, Option } from 'effect'
import { buildBoards } from '../domain/boards'
import {
	DEFAULT_CANDIDATE_CONTRIBUTORS,
	selectCandidates,
} from '../domain/candidates'
import { scoreSeason } from '../domain/score-season'
import { assembleSeason } from '../domain/season'
import { toSeasonIndexEntry, upsertSeasonIndex } from '../domain/season-index'
import { buildShards } from '../domain/shards'
import {
	toBuildSeasonReport,
	type BuildSeasonReport,
} from './build-season-report'
import type { EnrichmentSourceError } from './enrichment-source.error'
import { EnrichmentSource } from './enrichment-source.port'
import type { SeasonStoreError } from './season-store.error'
import { SeasonStore } from './season-store.port'

/** Daily aggregates read at the same time. */
export const DAY_READ_CONCURRENCY = 8

/** Shard files written at the same time. */
export const SHARD_WRITE_CONCURRENCY = 16

export interface BuildSeasonOptions {
	/** Contributors selected as candidates for enrichment. */
	readonly candidateContributors?: number
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
 * Scores a season from its daily aggregates and writes every file the website
 * reads in this order: candidates, all 256 shards, boards, and the season index
 * last, so a failure mid-run leaves boards and index on the previous build as
 * far as possible. Builds run one at a time; a failed build is repaired by
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

			const readDays = Effect.fn('BuildSeason.readDays')(function* (
				seasonId: SeasonId
			) {
				const days = yield* Effect.forEach(
					daysInSeason(seasonId),
					date => dailyAggregates.read(date),
					{
						concurrency: DAY_READ_CONCURRENCY,
					}
				)

				return days.flatMap(day => Option.toArray(day))
			})

			const run = Effect.fn('BuildSeason.run')(function* (
				seasonId: SeasonId,
				{
					candidateContributors = DEFAULT_CANDIDATE_CONTRIBUTORS,
				}: BuildSeasonOptions = {}
			) {
				const [duration, result] = yield* Effect.timed(
					Effect.gen(function* () {
						const now = new Date(yield* Clock.currentTimeMillis)
						const computedAt = now.toISOString()
						const enrichment = yield* enrichmentSource.read(seasonId)
						const season = assembleSeason({
							seasonId,
							days: yield* readDays(seasonId),
							isBotLogin: login =>
								isBot(login) ||
								enrichment.contributors.get(login)?.isBot === true,
						})
						const scored = scoreSeason(season, enrichment)
						const candidates = selectCandidates(
							{ season, scored },
							{
								contributors: candidateContributors,
							}
						)
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
							yield* store.writeCandidates({
								season: seasonId,
								computedAt,
								...candidates,
							}),
							...(yield* Effect.forEach(
								shards,
								([shardKey, shard]) => store.writeShard(shardKey, shard),
								{ concurrency: SHARD_WRITE_CONCURRENCY }
							)),
							yield* store.writeBoard(boards.global),
							yield* store.writeBoard(boards.poland),
							yield* store.writeRepositoryBoard(boards.repositories),
						]
						const entry = toSeasonIndexEntry({ season, scored, now })
						const index = upsertSeasonIndex(
							Option.getOrUndefined(yield* store.readIndex()),
							entry
						)

						return {
							season,
							scored,
							candidates,
							status: entry.status,
							missingDays: entry.missingDays,
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
