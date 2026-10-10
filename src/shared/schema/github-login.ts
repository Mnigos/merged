import { GITHUB_LOGIN_PATTERN } from '@shared/github/login-pattern'
import { Schema } from 'effect'

export const githubLoginSchema = Schema.NonEmptyString.pipe(
	Schema.brand('GitHubLogin')
)
export type GitHubLogin = typeof githubLoginSchema.Type

/** A login typed by a visitor or taken from a URL, checked against GitHub's login rule. */
export const githubLoginInputSchema = githubLoginSchema.pipe(
	Schema.check(Schema.isPattern(GITHUB_LOGIN_PATTERN))
)
