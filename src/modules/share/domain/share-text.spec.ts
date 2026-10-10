import { describe, expect, it } from '@effect/vitest'
import { toShareText, toXIntentUrl } from './share-text'

describe('toShareText', () => {
	it('includes the Poland rank when present', () => {
		const input = {
			mergedPullRequests: 41,
			repositories: 8,
			seasonName: 'October 2026',
			rank: 12,
			contributors: 6853,
			polandRank: 2,
		}

		expect(toShareText(input)).toMatch(/#2\b.*Poland/u)
	})
	it('reads as one first-person sentence with the rank', () => {
		expect(
			toShareText({
				mergedPullRequests: 41,
				repositories: 8,
				seasonName: 'October 2026',
				rank: 4,
				contributors: 6853,
			})
		).toBe(
			'I got merged 41 times into 8 repositories in October 2026, #4 of 6,853 on merged'
		)
	})

	it('says once and repository for single counts', () => {
		expect(
			toShareText({
				mergedPullRequests: 1,
				repositories: 1,
				seasonName: 'October 2026',
				rank: 1204,
				contributors: 212_418,
			})
		).toBe(
			'I got merged once into 1 repository in October 2026, #1,204 of 212,418 on merged'
		)
	})
})

describe('toXIntentUrl', () => {
	it('preserves reserved characters and a result URL with its own query', () => {
		const text = 'Merged #12 & #2 in Poland + 99.9% · Łódź'
		const url = 'https://merged.dev/u/alice?season=2026-10&board=poland#result'
		const intent = new URL(toXIntentUrl({ text, url }))

		expect([...intent.searchParams.entries()]).toEqual([
			['text', text],
			['url', url],
		])
		expect(intent.hash).toBe('')
	})
	it('encodes text and URL into the X composer link', () => {
		const intent = new URL(
			toXIntentUrl({
				text: 'I got merged 41 times, #4 of 6,853 on merged',
				url: 'https://merged.dev/u/k-wojcik',
			})
		)

		expect(intent.origin + intent.pathname).toBe('https://x.com/intent/tweet')
		expect(intent.searchParams.get('text')).toBe(
			'I got merged 41 times, #4 of 6,853 on merged'
		)
		expect(intent.searchParams.get('url')).toBe('https://merged.dev/u/k-wojcik')
	})
})
