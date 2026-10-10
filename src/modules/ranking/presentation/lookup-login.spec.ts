import { describe, expect, it } from '@effect/vitest'
import { isGitHubLogin, toLookupLogin } from './lookup-login'

describe('toLookupLogin', () => {
	it.each([
		['steipete', 'steipete'],
		['  Steipete  ', 'steipete'],
		['@steipete', 'steipete'],
		['github.com/steipete', 'steipete'],
		['https://github.com/Mnigos/', 'mnigos'],
		['https://www.github.com/k-wojcik?tab=repositories', 'k-wojcik'],
		['github.com/@steipete', 'steipete'],
		[' https://github.com/Mnigos/project/pulls?state=closed#merged ', 'mnigos'],
		['a', 'a'],
		['a'.repeat(39), 'a'.repeat(39)],
		['A-1-b', 'a-1-b'],
	])('reads %j as %s', (input, login) => {
		expect(toLookupLogin(input)).toBe(login)
	})

	it.each([
		'',
		'   ',
		'@',
		'not a login',
		'-dash',
		'github.com/',
		'a'.repeat(40),
		'under_score',
		'Łukasz',
		'https://example.com/alice',
		'https://github.com.evil.example/alice',
	])('rejects %j', input => {
		expect(toLookupLogin(input)).toBeUndefined()
	})
})

describe('legacy GitHub logins', () => {
	it.each([
		['accepts legacy logins with a trailing hyphen such as rr-', 'rr-'],
		['accepts consecutive hyphens', 'double--dash'],
	])('%s at lookup', (_reason, login) => {
		expect(toLookupLogin(login)).toBe(login)
	})

	it.each([
		['accepts legacy logins with a trailing hyphen such as rr-', 'rr-'],
		['accepts consecutive hyphens', 'double--dash'],
	])('%s as a login', (_reason, login) => {
		expect(isGitHubLogin(login)).toBe(true)
	})

	it.each([
		'-leading',
		'',
		'a'.repeat(40),
		'under_score',
		'dot.name',
		'Łukasz',
	])('still rejects %j', login => {
		expect(isGitHubLogin(login)).toBe(false)
	})
})

describe('isGitHubLogin', () => {
	it('checks GitHub login rules', () => {
		expect(isGitHubLogin('steipete')).toBeTruthy()
		expect(isGitHubLogin('dependabot[bot]')).toBeFalsy()
	})
})
