import type { SeasonId } from '@shared/schema/season-id'
import { Clock, Context, Duration, Effect, Layer, Option } from 'effect'
import type { EnrichmentTargets } from '../domain/enrichment-targets'
import { isFresh, isSettledMerge } from '../domain/freshness'
import { toMergeResolutionKey } from '../domain/merge-resolution'
import { enrichKind } from './enrich-kind'
import { toEnrichReport, type EnrichReport } from './enrich-report'
import type { ProfileSourceError } from './profile-source.error'
import { ProfileSource } from './profile-source.port'
import type { ProfileStoreError } from './profile-store.error'
import { ProfileStore } from './profile-store.port'

export interface EnrichOptions {
	/** Enrich only the first N candidate contributors (they come in pass 1 rank order); all by default. */
	readonly contributors?: number
	readonly repositories?: number
	readonly pullRequests?: number
	/** Refetch profiles older than this; `DEFAULT_MAX_AGE_DAYS` by default. */
	readonly maxAgeDays?: number
}

export interface EnrichShape {
	readonly run: (
		seasonId: SeasonId,
		targets: EnrichmentTargets,
		options?: EnrichOptions
	) => Effect.Effect<EnrichReport, ProfileStoreError | ProfileSourceError>
}

/**
 * Enrichment of a season's candidates through GitHub: real stars and language
 * of repositories, contributor profiles, and mergers of pull requests. Fresh
 * entries of earlier runs are kept, the rest is fetched in batches and merged
 * into `repos.json`, `profiles.json` and `mergers.json`. Profiles never picks
 * candidates; the caller hands them over.
 */
export class Enrich extends Context.Service<Enrich, EnrichShape>()(
	'profiles/Enrich'
) {
	static readonly layer = Layer.effect(
		Enrich,
		Effect.gen(function* () {
			const source = yield* ProfileSource
			const store = yield* ProfileStore

			const stamp = Clock.currentTimeMillis.pipe(
				Effect.map(millis => new Date(millis).toISOString())
			)

			const run = Effect.fn('Enrich.run')(function* (
				seasonId: SeasonId,
				targets: EnrichmentTargets,
				{
					contributors: contributorLimit,
					repositories: repositoryLimit,
					pullRequests: pullRequestLimit,
					maxAgeDays,
				}: EnrichOptions = {}
			) {
				const [duration, kinds] = yield* Effect.timed(
					Effect.gen(function* () {
						const nowMs = yield* Clock.currentTimeMillis
						const fresh = (entry: { readonly fetchedAt: string }) =>
							isFresh(entry.fetchedAt, nowMs, maxAgeDays)

						const repositories = yield* enrichKind({
							targets: targets.repositories.slice(0, repositoryLimit),
							keyOf: repository => repository,
							entryKeyOf: profile => profile.repository,
							cached:
								Option.getOrUndefined(yield* store.readRepositories(seasonId))
									?.repositories ?? {},
							isFresh: fresh,
							isMissing: profile => profile.missing,
							fetch: source.fetchRepositories,
							save: entries =>
								stamp.pipe(
									Effect.flatMap(updatedAt =>
										store.writeRepositories({
											season: seasonId,
											updatedAt,
											repositories: entries,
										})
									)
								),
						})
						const contributors = yield* enrichKind({
							targets: targets.contributors.slice(0, contributorLimit),
							keyOf: login => login,
							entryKeyOf: profile => profile.login,
							cached:
								Option.getOrUndefined(yield* store.readContributors(seasonId))
									?.contributors ?? {},
							isFresh: fresh,
							isMissing: profile => profile.missing,
							fetch: source.fetchContributors,
							save: entries =>
								stamp.pipe(
									Effect.flatMap(updatedAt =>
										store.writeContributors({
											season: seasonId,
											updatedAt,
											contributors: entries,
										})
									)
								),
						})
						const pullRequests = yield* enrichKind({
							targets: targets.pullRequests.slice(0, pullRequestLimit),
							keyOf: target =>
								toMergeResolutionKey(target.repository, target.number),
							entryKeyOf: resolution =>
								toMergeResolutionKey(resolution.repository, resolution.number),
							cached:
								Option.getOrUndefined(yield* store.readMergers(seasonId))
									?.pullRequests ?? {},
							isFresh: resolution =>
								isSettledMerge(resolution, nowMs, maxAgeDays),
							isMissing: resolution => resolution.mergedBy === null,
							fetch: source.fetchMergers,
							save: entries =>
								stamp.pipe(
									Effect.flatMap(updatedAt =>
										store.writeMergers({
											season: seasonId,
											updatedAt,
											pullRequests: entries,
										})
									)
								),
						})

						return { repositories, contributors, pullRequests }
					})
				)
				const report = toEnrichReport({
					season: seasonId,
					...kinds,
					durationMs: Duration.toMillis(duration),
				})
				yield* Effect.logInfo('season enriched').pipe(
					Effect.annotateLogs({
						season: seasonId,
						queries: report.queries,
						cost: report.cost,
						ms: report.durationMs,
					})
				)

				return report
			})

			return { run }
		})
	)
}
