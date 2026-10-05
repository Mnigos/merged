import type { IsoDate } from '@shared/schema/iso-date'
import { Effect, Layer, Stream } from 'effect'
import { ArchiveSourceError } from '../application/archive-source.error'
import { ArchiveSource } from '../application/archive-source.port'

const encoder = new TextEncoder()

/** Test `ArchiveSource` serving raw JSON-lines text per hour; a missing hour fails. */
export const inMemoryArchiveSourceLayer = (
	hours: ReadonlyMap<number, string>
) =>
	Layer.succeed(ArchiveSource, {
		readHour: (date: IsoDate, hour: number) => {
			const text = hours.get(hour)
			if (text === undefined)
				return {
					lines: Stream.fail(
						new ArchiveSourceError({
							date,
							hour,
							message: `no fixture for hour ${hour}`,
						})
					),
					bytesRead: Effect.succeed(0),
				}

			return {
				lines: Stream.make(text).pipe(Stream.splitLines),
				bytesRead: Effect.succeed(encoder.encode(text).byteLength),
			}
		},
	})
