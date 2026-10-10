import { GITHUB_LOGIN_PATTERN } from '@shared/github/login-pattern'

const GITHUB_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//iu

/** True when a value follows GitHub's login rule. */
export const isGitHubLogin = (value: string) => GITHUB_LOGIN_PATTERN.test(value)

/**
 * The login a visitor meant, lowercase, or `undefined` when the input is not
 * a GitHub login. Accepts `steipete`, `@steipete` and profile URLs such as
 * `github.com/steipete` or `https://github.com/steipete?tab=repositories`.
 */
export function toLookupLogin(input: string) {
	const [login = ''] = input
		.trim()
		.replace(GITHUB_PREFIX, '')
		.replace(/^@/u, '')
		.split(/[/?#]/u, 1)

	return isGitHubLogin(login) ? login.toLowerCase() : undefined
}
