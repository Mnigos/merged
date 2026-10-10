import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { githubLoginInputSchema } from './github-login'

const decode = Schema.decodeUnknownResult(githubLoginInputSchema)

describe('githubLoginInputSchema', () => {
	it.each(['steipete', 'Mnigos', 'k-wojcik', '1234', 'a'.repeat(39)])(
		'accepts the login %s',
		value => {
			expect(Result.getOrThrow(decode(value))).toBe(value)
		}
	)

	it.each(['', '-leading', 'with space', 'dependabot[bot]', 'a'.repeat(40)])(
		'rejects %j',
		value => {
			expect(Result.isFailure(decode(value))).toBeTruthy()
		}
	)
})
