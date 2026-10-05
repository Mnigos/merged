import { Schema } from 'effect'

export const githubLoginSchema = Schema.NonEmptyString.pipe(
	Schema.brand('GitHubLogin')
)
export type GitHubLogin = typeof githubLoginSchema.Type
