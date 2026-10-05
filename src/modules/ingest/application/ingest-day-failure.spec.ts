import { describe, expect, it } from '@effect/vitest'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, Layer, Option, Stream } from 'effect'
import { vi } from 'vitest'
import hourZero from '../testing/fixtures/archive-hour-0.jsonl?raw'
import hourOne from '../testing/fixtures/archive-hour-1.jsonl?raw'
import { inMemoryArchiveSourceLayer } from '../testing/in-memory-archive-source'
import { inMemoryDayStoreLayer } from '../testing/in-memory-day-store'
import { ArchiveSourceError } from './archive-source.error'
import { ArchiveSource } from './archive-source.port'
import { DayStore } from './day-store.port'
import { IngestDay } from './ingest-day.service'

const date = isoDateSchema.make('2026-10-03')

describe('IngestDay failed hour', () => {
	it.effect(
		'does not write when an hour fails after yielding valid events',
		() => {
			const failure = new ArchiveSourceError({
				date,
				hour: 1,
				message: 'body interrupted',
			})
			const requestedHours: number[] = []
			const yieldedLines: string[] = []
			const sourceLayer = Layer.effect(
				ArchiveSource,
				Effect.gen(function* () {
					const source = yield* ArchiveSource
					return {
						readHour: (requestedDate: typeof date, hour: number) => {
							requestedHours.push(hour)
							const archiveHour = source.readHour(requestedDate, hour)
							if (hour !== 1) return archiveHour
							return {
								...archiveHour,
								lines: archiveHour.lines.pipe(
									Stream.tap(line =>
										Effect.sync(() => {
											yieldedLines.push(line)
										})
									),
									Stream.concat(Stream.fail(failure))
								),
							}
						},
					}
				})
			).pipe(
				Layer.provide(
					inMemoryArchiveSourceLayer(
						new Map([
							[0, hourZero],
							[1, hourOne],
						])
					)
				)
			)

			return Effect.gen(function* () {
				const store = yield* DayStore
				const writeSpy = vi.spyOn(store, 'write')
				const ingestDay = yield* IngestDay
				const error = yield* Effect.flip(
					ingestDay.ingest(date, { hours: [0, 1], concurrency: 1 })
				)

				expect(error).toBeInstanceOf(ArchiveSourceError)
				expect(error).toBe(failure)
				expect(requestedHours).toEqual([0, 1])
				expect(yieldedLines).toEqual(hourOne.trimEnd().split('\n'))
				expect(writeSpy).toHaveBeenCalledTimes(0)
				expect(yield* store.read(date)).toEqual(Option.none())
			}).pipe(
				Effect.provide(
					IngestDay.layer.pipe(
						Layer.provideMerge(
							Layer.mergeAll(sourceLayer, inMemoryDayStoreLayer)
						)
					)
				)
			)
		}
	)
})
