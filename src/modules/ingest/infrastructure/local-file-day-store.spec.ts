import { BunFileSystem, BunPath } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, FileSystem, Layer, Option } from 'effect'
import { DayStore } from '../application/day-store.port'
import type { DailyAggregate } from '../domain/daily-aggregate'
import { localFileDayStoreLayer } from './local-file-day-store'

const date = isoDateSchema.make('2026-10-03')
const platformLayer = Layer.mergeAll(BunFileSystem.layer, BunPath.layer)

const aggregate = {
	date,
	totals: { merged: 1, selfMerged: 0, ownRepo: 1, stars: 2 },
	contributions: [
		{
			author: githubLoginSchema.make('alice'),
			repository: 'acme/widgets',
			merged: 1,
			selfMerged: 0,
			mergedPullRequests: [7],
		},
	],
	ownRepoMerges: { alice: 1 },
	repositories: [{ repository: 'acme/widgets', stars: 2, mergeAuthors: 1 }],
} as const satisfies DailyAggregate

const withStore = <TValue, TError>(
	use: (
		directory: string
	) => Effect.Effect<TValue, TError, DayStore | FileSystem.FileSystem>
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem
		const directory = yield* fs.makeTempDirectoryScoped()

		return yield* use(directory).pipe(
			Effect.provide(localFileDayStoreLayer(directory))
		)
	}).pipe(Effect.provide(platformLayer))

describe('localFileDayStoreLayer', () => {
	it.live('writes days/<date>.json and reads it back', () =>
		withStore(directory =>
			Effect.gen(function* () {
				const store = yield* DayStore
				const fs = yield* FileSystem.FileSystem
				const stored = yield* store.write(aggregate)

				expect(stored.location).toBe(`${directory}/days/2026-10-03.json`)
				expect(stored.bytes).toBe(
					(yield* fs.readFileString(stored.location)).length
				)
				expect(Option.getOrThrow(yield* store.read(date))).toEqual(aggregate)
			})
		)
	)

	it.live('reads a day that was never written as none', () =>
		withStore(() =>
			Effect.gen(function* () {
				const store = yield* DayStore

				expect(Option.isNone(yield* store.read(date))).toBe(true)
			})
		)
	)

	it.live('fails with DayStoreError on a corrupt file', () =>
		withStore(directory =>
			Effect.gen(function* () {
				const store = yield* DayStore
				const fs = yield* FileSystem.FileSystem
				yield* fs.makeDirectory(`${directory}/days`, { recursive: true })
				yield* fs.writeFileString(`${directory}/days/2026-10-03.json`, '{')

				expect(yield* Effect.flip(store.read(date))).toMatchObject({
					_tag: 'DayStoreError',
					date: '2026-10-03',
				})
			})
		)
	)
})
