import type { IsoDate } from '@shared/schema/iso-date'
import { Effect, Layer, Stream } from 'effect'
import { ArchiveSource } from '../../application/archive-source.port'
import { emptyHourScan, scanLine } from '../../application/hour-scan'
import { IngestSource } from '../../application/ingest-source.port'

/**
 * `IngestSource` over the GH Archive hour files of `ArchiveSource`: each
 * hour's lines stream through `scanLine` (one request per hour), so merges
 * and stars come from `PullRequestEvent` and `WatchEvent` lines.
 */
export const archiveIngestSourceLayer = Layer.effect(
	IngestSource,
	Effect.gen(function* () {
		const archive = yield* ArchiveSource

		const readHour = Effect.fn('ArchiveIngestSource.readHour')(function* (
			date: IsoDate,
			hour: number
		) {
			const archiveHour = archive.readHour(date, hour)
			const scan = yield* Stream.runFold(
				archiveHour.lines,
				emptyHourScan,
				scanLine
			)

			return {
				merges: scan.merges,
				stars: scan.stars,
				counts: {
					requests: 1,
					bytesDownloaded: yield* archiveHour.bytesRead,
					linesSeen: scan.linesSeen,
					linesPreFiltered: scan.linesPreFiltered,
					eventsDecoded: scan.eventsDecoded,
					invalidLines: scan.invalidLines,
					ignoredEvents: scan.ignoredEvents,
					botEvents: scan.botEvents,
				},
			}
		})

		return { readHour }
	})
)
