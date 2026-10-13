import type { IsoDate } from '@shared/schema/iso-date.schema'
import { Context, type Effect } from 'effect'
import type { MergeEvent } from '../domain/merge-event.model'
import type { StarEvent } from '../domain/star-event.model'
import type { ArchiveSourceError } from './archive-source.error'
import type { SearchSourceError } from './search-source.error'

/**
 * What an ingest source read for one hour. Counters a source does not have
 * stay 0: the search source downloads no archive lines, the archive source
 * sends one request per hour.
 */
export interface HourCounts {
	/** Requests sent: one archive file, or one search page per query. */
	readonly requests: number
	readonly bytesDownloaded: number
	readonly linesSeen: number
	readonly linesPreFiltered: number
	/** Archive events or search results decoded. */
	readonly eventsDecoded: number
	readonly invalidLines: number
	/** Decoded events that are not a usable merge, such as a pull request whose author was deleted. */
	readonly ignoredEvents: number
	readonly botEvents: number
}

/** The merged pull requests and stars of one UTC hour, bots excluded. */
export interface HourEvents {
	readonly merges: readonly MergeEvent[]
	readonly stars: readonly StarEvent[]
	readonly counts: HourCounts
}

export interface IngestSourceShape {
	readonly readHour: (
		date: IsoDate,
		hour: number
	) => Effect.Effect<HourEvents, ArchiveSourceError | SearchSourceError>
}

/** Where ingest reads an hour's merges and stars from: GH Archive or GitHub search. */
export class IngestSource extends Context.Service<
	IngestSource,
	IngestSourceShape
>()('ingest/IngestSource') {}
