import { isBot } from '@shared/github/bots'
import {
	decodeArchiveLine,
	hasArchiveEventMarker,
	type ArchiveEvent,
} from '../domain/archive-event'
import { toMergeEvent, type MergeEvent } from '../domain/merge-event'
import { toStarEvent, type StarEvent } from '../domain/star-event'

/** Running tally of one GH Archive hour, filled line by line. */
export interface HourScan {
	linesSeen: number
	linesPreFiltered: number
	eventsDecoded: number
	invalidLines: number
	ignoredEvents: number
	botEvents: number
	readonly merges: MergeEvent[]
	readonly stars: StarEvent[]
}

export const emptyHourScan = (): HourScan => ({
	linesSeen: 0,
	linesPreFiltered: 0,
	eventsDecoded: 0,
	invalidLines: 0,
	ignoredEvents: 0,
	botEvents: 0,
	merges: [],
	stars: [],
})

function collectEvent(scan: HourScan, event: ArchiveEvent) {
	if (event.type === 'WatchEvent') {
		if (isBot(event.actor.login)) scan.botEvents++
		else scan.stars.push(toStarEvent(event))
		return
	}

	const merge = toMergeEvent(event)
	if (!merge) scan.ignoredEvents++
	else if (isBot(merge.author)) scan.botEvents++
	else scan.merges.push(merge)
}

/**
 * Adds one raw line to the scan: lines without a PullRequestEvent or WatchEvent
 * marker are counted and dropped before JSON parsing, malformed lines are
 * counted as invalid, bot merges and bot stars are excluded.
 */
export function scanLine(scan: HourScan, line: string) {
	scan.linesSeen++
	if (!hasArchiveEventMarker(line)) {
		scan.linesPreFiltered++
		return scan
	}

	const event = decodeArchiveLine(line)
	if (!event) {
		scan.invalidLines++
		return scan
	}

	scan.eventsDecoded++
	collectEvent(scan, event)

	return scan
}
