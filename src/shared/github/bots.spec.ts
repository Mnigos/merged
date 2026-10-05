import { describe, expect, it } from '@effect/vitest'
import { isBot } from './bots'

describe('isBot', () => {
	it('detects bots by suffix and by known login', () => {
		expect(isBot('dependabot[bot]')).toBe(true)
		expect(isBot('Renovate')).toBe(true)
		expect(isBot('Mnigos')).toBe(false)
	})
})
