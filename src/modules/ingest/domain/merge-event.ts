import type { GitHubLogin } from '@shared/schema/github-login'
import { Schema } from 'effect'
import type { PullRequestEvent } from './archive-event'

export const mergeKindSchema = Schema.Literals([
	'merged',
	'selfMerged',
	'ownRepo',
])
export type MergeKind = typeof mergeKindSchema.Type

/** A merged pull request read from one GH Archive line. */
export interface MergeEvent {
	readonly author: GitHubLogin
	readonly repository: string
	readonly repositoryId: number
	readonly owner: string
	/** `undefined` when the archive line does not name who merged. */
	readonly mergedBy: GitHubLogin | undefined
	readonly mergedAt: string
	readonly number: number
	readonly mergeKind: MergeKind
}

interface MergeParties {
	readonly author: string
	readonly owner: string
	readonly mergedBy: string | undefined
}

const sameLogin = (left: string, right: string | undefined) =>
	right !== undefined && left.toLowerCase() === right.toLowerCase()

/**
 * Merge kind per UBIQUITOUS_LANGUAGE: own-repo when the author owns the
 * repository, self-merged when the author merged, merged otherwise. An unknown
 * merger counts as merged by someone else.
 */
export function classifyMerge({
	author,
	owner,
	mergedBy,
}: MergeParties): MergeKind {
	if (sameLogin(author, owner)) return 'ownRepo'
	if (sameLogin(author, mergedBy)) return 'selfMerged'

	return 'merged'
}

interface MergeFacts {
	readonly author: GitHubLogin
	readonly mergedBy: GitHubLogin | undefined
	readonly mergedAt: string
}

function getMergeFacts({
	actor,
	created_at,
	payload,
}: PullRequestEvent): MergeFacts | undefined {
	if (payload.action === 'merged')
		return {
			author: actor.login,
			mergedBy: undefined,
			mergedAt: created_at,
		}

	const pullRequest = payload.pull_request
	if (payload.action !== 'closed' || pullRequest?.merged !== true)
		return undefined
	if (!pullRequest.user) return undefined

	return {
		author: pullRequest.user.login,
		mergedBy: pullRequest.merged_by?.login,
		mergedAt: pullRequest.merged_at ?? created_at,
	} satisfies MergeFacts
}

/** The merged pull request in a `PullRequestEvent`, `undefined` for any other action. */
export function toMergeEvent(event: PullRequestEvent): MergeEvent | undefined {
	const facts = getMergeFacts(event)
	if (!facts) return undefined

	const [owner = ''] = event.repo.name.split('/')

	return {
		...facts,
		repository: event.repo.name,
		repositoryId: event.repo.id,
		owner,
		number: event.payload.number,
		mergeKind: classifyMerge({ ...facts, owner }),
	}
}
