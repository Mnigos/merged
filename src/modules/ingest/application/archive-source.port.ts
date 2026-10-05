import type { IsoDate } from '@shared/schema/iso-date'
import { Context, type Effect, type Stream } from 'effect'
import type { ArchiveSourceError } from './archive-source.error'

/** One GH Archive hour as raw JSON lines, plus the bytes downloaded so far. */
export interface ArchiveHour {
	readonly lines: Stream.Stream<string, ArchiveSourceError>
	readonly bytesRead: Effect.Effect<number>
}

export interface ArchiveSourceShape {
	readonly readHour: (date: IsoDate, hour: number) => ArchiveHour
}

export class ArchiveSource extends Context.Service<
	ArchiveSource,
	ArchiveSourceShape
>()('ingest/ArchiveSource') {}
