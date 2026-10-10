import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { seasonIdSchema } from '@shared/schema/season-id'
import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Effect, Layer, Option } from 'effect'
import { ProfileStore } from '../application/profile-store.port'
import {
	jsonProfileStoreLayer,
	toContributorsPath,
	toMergersPath,
	toRepositoriesPath,
} from './json-profile-store'

const seasonId = seasonIdSchema.make('2026-10')
const fetchedAt = '2026-10-10T06:00:00.000Z'

const repositoriesFile = {
	season: seasonId,
	updatedAt: fetchedAt,
	repositories: {
		'acme/widgets': {
			repository: 'acme/widgets',
			stars: 1200,
			language: 'Go',
			fetchedAt,
			missing: false,
		},
	},
}
const contributorsFile = {
	season: seasonId,
	updatedAt: fetchedAt,
	contributors: {
		alice: {
			login: githubLoginSchema.make('alice'),
			name: 'Alice',
			location: 'Łódź',
			company: null,
			avatarUrl: null,
			fetchedAt,
			missing: false,
		},
	},
}
const mergersFile = {
	season: seasonId,
	updatedAt: fetchedAt,
	pullRequests: {
		'acme/widgets#5': {
			repository: 'acme/widgets',
			number: 5,
			mergedBy: githubLoginSchema.make('alice'),
			fetchedAt,
		},
	},
}

const storeOver = (files: Map<string, string>) =>
	jsonProfileStoreLayer.pipe(Layer.provide(inMemoryJsonStorageLayer(files)))

describe('jsonProfileStoreLayer', () => {
	it('places the files next to the season files', () => {
		expect(toRepositoriesPath(seasonId)).toBe('seasons/2026-10/repos.json')
		expect(toContributorsPath(seasonId)).toBe('seasons/2026-10/profiles.json')
		expect(toMergersPath(seasonId)).toBe('seasons/2026-10/mergers.json')
	})

	it.effect('reads absent files as none', () =>
		Effect.gen(function* () {
			const store = yield* ProfileStore

			expect(Option.isNone(yield* store.readRepositories(seasonId))).toBe(true)
			expect(Option.isNone(yield* store.readContributors(seasonId))).toBe(true)
			expect(Option.isNone(yield* store.readMergers(seasonId))).toBe(true)
		}).pipe(Effect.provide(storeOver(new Map())))
	)

	it.effect('round trips the three files', () => {
		const files = new Map<string, string>()

		return Effect.gen(function* () {
			const store = yield* ProfileStore
			yield* store.writeRepositories(repositoriesFile)
			yield* store.writeContributors(contributorsFile)
			yield* store.writeMergers(mergersFile)

			expect([...files.keys()].toSorted()).toEqual([
				'seasons/2026-10/mergers.json',
				'seasons/2026-10/profiles.json',
				'seasons/2026-10/repos.json',
			])
			expect(yield* store.readRepositories(seasonId)).toEqual(
				Option.some(repositoriesFile)
			)
			expect(yield* store.readContributors(seasonId)).toEqual(
				Option.some(contributorsFile)
			)
			expect(yield* store.readMergers(seasonId)).toEqual(
				Option.some(mergersFile)
			)
		}).pipe(Effect.provide(storeOver(files)))
	})

	it.effect('fails with ProfileStoreError on a corrupt file', () =>
		Effect.gen(function* () {
			const store = yield* ProfileStore

			expect(
				yield* Effect.flip(store.readRepositories(seasonId))
			).toMatchObject({
				_tag: 'ProfileStoreError',
				path: 'seasons/2026-10/repos.json',
			})
		}).pipe(
			Effect.provide(
				storeOver(new Map([['seasons/2026-10/repos.json', '{"season":1}']]))
			)
		)
	)

	it.effect.each(['{', '{"season":1}'])(
		'rejects corrupt data in every profile file: %s',
		text => {
			const paths = [
				toRepositoriesPath(seasonId),
				toContributorsPath(seasonId),
				toMergersPath(seasonId),
			]

			return Effect.gen(function* () {
				const store = yield* ProfileStore
				for (const [read, path] of [
					[Effect.flip(store.readRepositories(seasonId)), paths[0]],
					[Effect.flip(store.readContributors(seasonId)), paths[1]],
					[Effect.flip(store.readMergers(seasonId)), paths[2]],
				] as const)
					expect(yield* read).toMatchObject({ _tag: 'ProfileStoreError', path })
			}).pipe(
				Effect.provide(storeOver(new Map(paths.map(path => [path, text]))))
			)
		}
	)
})
