import { describe, expect, it } from '@effect/vitest'
import archiveHour from '../testing/fixtures/archive-hour-0.jsonl?raw'
import { decodeArchiveLine, hasArchiveEventMarker } from './archive-event'

const lines = archiveHour.trimEnd().split('\n')
const lineOf = (type: string, index = 0) => {
	const line = lines.filter(candidate =>
		candidate.includes(`"type":"${type}"`)
	)[index]
	if (line === undefined) throw new Error(`no ${type} line ${index}`)

	return line
}

describe('hasArchiveEventMarker', () => {
	it('lets PullRequestEvent and WatchEvent lines through', () => {
		expect(hasArchiveEventMarker(lineOf('PullRequestEvent'))).toBe(true)
		expect(hasArchiveEventMarker(lineOf('WatchEvent'))).toBe(true)
	})

	it('drops other event types, including PullRequestReviewEvent', () => {
		expect(hasArchiveEventMarker(lineOf('PushEvent'))).toBe(false)
		expect(hasArchiveEventMarker(lineOf('PullRequestReviewEvent'))).toBe(false)
		expect(hasArchiveEventMarker(lineOf('IssueCommentEvent'))).toBe(false)
	})
})

describe('decodeArchiveLine', () => {
	it('decodes a merged pull request in the trimmed format', () => {
		expect(decodeArchiveLine(lineOf('PullRequestEvent'))).toMatchObject({
			type: 'PullRequestEvent',
			actor: { login: 'alice' },
			repo: { id: 101, name: 'acme/widgets' },
			payload: { action: 'merged', number: 1 },
		})
	})

	it('decodes a merged pull request in the legacy format', () => {
		expect(decodeArchiveLine(lineOf('PullRequestEvent', 3))).toMatchObject({
			payload: {
				action: 'closed',
				number: 4,
				pull_request: {
					merged: true,
					user: { login: 'bob' },
					merged_by: { login: 'bob' },
				},
			},
		})
	})

	it('decodes a WatchEvent', () => {
		expect(decodeArchiveLine(lineOf('WatchEvent'))).toMatchObject({
			type: 'WatchEvent',
			actor: { login: 'zoe' },
			repo: { name: 'acme/widgets' },
		})
	})

	it('strips fields ingest does not read', () => {
		expect(decodeArchiveLine(lineOf('WatchEvent'))).not.toHaveProperty(
			'payload'
		)
	})

	it('returns undefined for an unrelated event type', () => {
		expect(decodeArchiveLine(lineOf('PushEvent'))).toBeUndefined()
	})

	it('returns undefined for a truncated line', () => {
		expect(
			decodeArchiveLine('{"id":"1","type":"PullRequestEvent","actor":{')
		).toBeUndefined()
	})

	it('returns undefined for a pull request event without a number', () => {
		expect(
			decodeArchiveLine(
				JSON.stringify({
					type: 'PullRequestEvent',
					actor: { login: 'alice' },
					repo: { id: 1, name: 'acme/widgets' },
					created_at: '2026-10-03T00:00:00Z',
					payload: { action: 'merged' },
				})
			)
		).toBeUndefined()
	})
})
