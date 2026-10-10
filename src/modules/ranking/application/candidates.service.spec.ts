import { describe, expect, it } from '@effect/vitest'
import { dailyAggregatesLayer } from '@modules/ingest/ingest.layer'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { emptyEnrichment } from '../domain/enrichment'
import { jsonSeasonStoreLayer } from '../infrastructure/json-season-store'
import { inMemoryEnrichmentSourceLayer } from '../testing/in-memory-enrichment-source'
import { seasonId, toDay } from '../testing/season.mock'
import { BuildSeason } from './build-season.service'
import { Candidates } from './candidates.service'

const candidatesOver = (files: Map<string, string>) =>
	Candidates.layer.pipe(
		Layer.provide(jsonSeasonStoreLayer),
		Layer.provide(inMemoryJsonStorageLayer(files))
	)

describe('Candidates.read', () => {
	it.effect('returns none before BuildSeason writes candidates', () =>
		Effect.gen(function* () {
			expect(yield* (yield* Candidates).read(seasonId)).toEqual(Option.none())
		}).pipe(Effect.provide(candidatesOver(new Map())))
	)

	it.effect(
		'decodes candidates written by BuildSeason with their ranked contributors and pull requests',
		() => {
			const files = new Map([
				[
					'days/2026-10-01.json',
					JSON.stringify(
						toDay({
							date: '2026-10-01',
							rows: [
								{
									author: 'alice',
									repository: 'acme/widgets',
									pullRequests: [1, 2],
								},
								{
									author: 'bob',
									repository: 'acme/widgets',
									pullRequests: [3],
								},
								{
									author: 'carol',
									repository: 'small/tool',
									pullRequests: [4],
								},
							],
						})
					),
				],
			])
			const buildLayer = BuildSeason.layer.pipe(
				Layer.provide(
					Layer.mergeAll(
						jsonSeasonStoreLayer,
						dailyAggregatesLayer,
						inMemoryEnrichmentSourceLayer(emptyEnrichment)
					)
				),
				Layer.provide(inMemoryJsonStorageLayer(files))
			)

			return Effect.gen(function* () {
				yield* TestClock.setTime(Date.parse('2026-10-02T06:00:00Z'))
				yield* Effect.gen(function* () {
					yield* (yield* BuildSeason).run(seasonId, {
						candidateContributors: 1,
					})
				}).pipe(Effect.provide(buildLayer))
				expect(yield* (yield* Candidates).read(seasonId)).toEqual(
					Option.some({
						season: seasonId,
						computedAt: '2026-10-02T06:00:00.000Z',
						contributors: ['alice'],
						repositories: ['acme/widgets', 'small/tool'],
						pullRequests: [
							{ repository: 'acme/widgets', number: 1, author: 'alice' },
							{ repository: 'acme/widgets', number: 2, author: 'alice' },
						],
					})
				)
			}).pipe(Effect.provide(candidatesOver(files)))
		}
	)

	it.effect(
		'propagates a store error when the candidates file cannot be decoded',
		() =>
			Effect.gen(function* () {
				expect(
					yield* Effect.flip((yield* Candidates).read(seasonId))
				).toMatchObject({
					_tag: 'SeasonStoreError',
					path: 'seasons/2026-10/candidates.json',
				})
			}).pipe(
				Effect.provide(
					candidatesOver(new Map([['seasons/2026-10/candidates.json', '{']]))
				)
			)
	)
})
