import { describe, expect, it } from '@effect/vitest'
import { redactSecrets } from './redact-secrets.helper'

describe('redactSecrets', () => {
	it('redacts the token, bearer values and GitHub token shapes', () => {
		expect(
			redactSecrets(
				'secret-123 Bearer abc token xyz ghp_AbC123 github_pat_11AB_cd',
				'secret-123'
			)
		).toBe('[redacted] [redacted] [redacted] [redacted] [redacted]')
	})

	it('leaves text without secrets unchanged when the secret is empty', () => {
		expect(redactSecrets('nothing to hide', '')).toBe('nothing to hide')
	})
})
