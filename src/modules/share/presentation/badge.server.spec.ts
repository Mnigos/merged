import { describe, expect, it } from '@effect/vitest'
import { beforeEach, vi } from 'vitest'
import { runServer } from '@/runtime/app-runtime.server'
import { UNAVAILABLE_BADGE, type Badge } from '../domain/badge'
import { toBadgeResponse } from './badge.server'

vi.mock('@/runtime/app-runtime.server', () => ({ runServer: vi.fn() }))

describe('toBadgeResponse', () => {
	beforeEach(() => vi.mocked(runServer).mockReset())

	it('returns invalid-login error JSON without reading storage', async () => {
		const response = await toBadgeResponse('not a login')

		expect(response.status).toBe(404)
		expect(response.headers.get('Cache-Control')).toBe('no-store')
		expect(await response.json()).toEqual({
			...UNAVAILABLE_BADGE,
			message: 'not a GitHub login',
		})
		expect(runServer).not.toHaveBeenCalled()
	})

	it('returns a read failure as an uncached error badge without provider details', async () => {
		vi.mocked(runServer).mockRejectedValueOnce(
			new Error('private provider detail')
		)
		const response = await toBadgeResponse('alice')

		expect(response.status).toBe(503)
		expect(response.headers.get('Cache-Control')).toBe('no-store')
		expect(await response.json()).toEqual(UNAVAILABLE_BADGE)
	})

	it('returns a successful badge as JSON cached for one hour', async () => {
		const badge = {
			schemaVersion: 1,
			label: 'merged',
			message: '#12 · Oct 2026',
			color: '7c3aed',
		} as const satisfies Badge
		vi.mocked(runServer).mockResolvedValueOnce(badge)
		const response = await toBadgeResponse('alice')

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toContain('application/json')
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
		expect(await response.json()).toEqual(badge)
	})
})
