import { describe, expect, it } from '@effect/vitest'
import { seasonProfilesLayer } from '@modules/profiles/profiles.layer'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer } from 'effect'
import { EnrichmentSource } from '../application/enrichment-source.port'
import { emptyEnrichment, toPullRequestKey } from '../domain/enrichment'
import { login, seasonId } from '../testing/season.mock'
import { profilesEnrichmentSourceLayer } from './profiles-enrichment-source'

const fetchedAt = '2026-10-10T06:00:00.000Z'

const seasonFiles = () =>
	new Map([
		[
			'seasons/2026-10/repos.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: fetchedAt,
				repositories: {
					'acme/widgets': {
						repository: 'acme/widgets',
						stars: 1200,
						language: 'Go',
						fetchedAt,
						missing: false,
					},
					'gone/away': {
						repository: 'gone/away',
						stars: 0,
						language: null,
						fetchedAt,
						missing: true,
					},
				},
			}),
		],
		[
			'seasons/2026-10/profiles.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: fetchedAt,
				contributors: {
					dave: {
						login: 'dave',
						name: 'Dave',
						location: 'Wrocław',
						company: null,
						avatarUrl: null,
						fetchedAt,
						missing: false,
					},
					'release-bot': {
						login: 'release-bot',
						name: null,
						location: null,
						company: null,
						avatarUrl: null,
						fetchedAt,
						missing: false,
					},
					ghost: {
						login: 'ghost',
						name: null,
						location: null,
						company: null,
						avatarUrl: null,
						fetchedAt,
						missing: true,
					},
				},
			}),
		],
		[
			'seasons/2026-10/mergers.json',
			JSON.stringify({
				season: '2026-10',
				updatedAt: fetchedAt,
				pullRequests: {
					'acme/widgets#5': {
						repository: 'acme/widgets',
						number: 5,
						mergedBy: 'alice',
						fetchedAt,
					},
					'acme/widgets#6': {
						repository: 'acme/widgets',
						number: 6,
						mergedBy: null,
						fetchedAt,
					},
				},
			}),
		],
	])

const sourceOver = (files: Map<string, string>) =>
	profilesEnrichmentSourceLayer.pipe(
		Layer.provide(seasonProfilesLayer),
		Layer.provide(inMemoryJsonStorageLayer(files))
	)

describe('profilesEnrichmentSourceLayer', () => {
	it.effect('maps found repositories, profiles and known mergers', () =>
		Effect.gen(function* () {
			const enrichment = yield* (yield* EnrichmentSource).read(seasonId)

			expect(enrichment.repositories).toEqual(
				new Map([['acme/widgets', { stars: 1200, language: 'Go' }]])
			)
			expect(enrichment.contributors).toEqual(
				new Map([
					[login('dave'), { name: 'Dave', location: 'Wrocław', isBot: false }],
					[login('release-bot'), { name: null, location: null, isBot: true }],
				])
			)
			expect(enrichment.mergers).toEqual(
				new Map([[toPullRequestKey('acme/widgets', 5), login('alice')]])
			)
		}).pipe(Effect.provide(sourceOver(seasonFiles())))
	)

	it.effect('returns the empty enrichment before enrich ran', () =>
		Effect.gen(function* () {
			expect(yield* (yield* EnrichmentSource).read(seasonId)).toBe(
				emptyEnrichment
			)
		}).pipe(Effect.provide(sourceOver(new Map())))
	)

	it.effect('maps the files that exist when others are absent', () => {
		const files = seasonFiles()
		files.delete('seasons/2026-10/profiles.json')
		files.delete('seasons/2026-10/mergers.json')

		return Effect.gen(function* () {
			const enrichment = yield* (yield* EnrichmentSource).read(seasonId)

			expect(enrichment.repositories.size).toBe(1)
			expect(enrichment.contributors.size).toBe(0)
			expect(enrichment.mergers.size).toBe(0)
		}).pipe(Effect.provide(sourceOver(files)))
	})

	it.effect('fails with EnrichmentSourceError on a corrupt file', () =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip((yield* EnrichmentSource).read(seasonId))
			).toMatchObject({ _tag: 'EnrichmentSourceError', season: '2026-10' })
		}).pipe(
			Effect.provide(
				sourceOver(new Map([['seasons/2026-10/mergers.json', 'not json']]))
			)
		)
	)

	it.effect(
		'lowercases repository, contributor and pull-request keys from stored profiles',
		() => {
			const files = new Map(
				[...seasonFiles()].map(([path, text]) => [
					path,
					text
						.replaceAll('acme/widgets', 'Acme/Widgets')
						.replaceAll('dave', 'DaVe')
						.replaceAll('alice', 'ALIce'),
				])
			)

			return Effect.gen(function* () {
				const enrichment = yield* (yield* EnrichmentSource).read(seasonId)
				expect({
					repositories: [...enrichment.repositories.keys()],
					contributors: [...enrichment.contributors.keys()],
					mergers: [...enrichment.mergers],
				}).toEqual({
					repositories: ['acme/widgets'],
					contributors: ['dave', 'release-bot'],
					mergers: [['acme/widgets#5', 'alice']],
				})
			}).pipe(Effect.provide(sourceOver(files)))
		}
	)
})
