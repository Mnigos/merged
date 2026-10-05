import type { GitHubLogin } from '@shared/schema/github-login'
import type { WatchEvent } from './archive-event'

/** A star given to a repository, read from a `WatchEvent` line. */
export interface StarEvent {
	readonly repository: string
	readonly stargazer: GitHubLogin
}

/** The star in a `WatchEvent`. */
export const toStarEvent = ({ actor, repo }: WatchEvent): StarEvent => ({
	repository: repo.name,
	stargazer: actor.login,
})
