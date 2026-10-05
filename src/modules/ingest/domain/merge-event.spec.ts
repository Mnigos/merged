import { describe, expect, it } from '@effect/vitest'
import { githubLoginSchema } from '@shared/schema/github-login'
import type { PullRequestEvent } from './archive-event'
import { classifyMerge, toMergeEvent } from './merge-event'

const login = githubLoginSchema.make

interface PullRequestEventInput {
	readonly actor?: string
	readonly repository?: string
	readonly payload: PullRequestEvent['payload']
}

const pullRequestEvent = ({
	actor = 'alice',
	repository = 'acme/widgets',
	payload,
}: PullRequestEventInput): PullRequestEvent => ({
	type: 'PullRequestEvent',
	actor: { login: login(actor) },
	repo: { id: 101, name: repository },
	created_at: '2026-10-03T15:00:00Z',
	payload,
})

interface LegacyInput {
	readonly author: string
	readonly mergedBy?: string
	readonly merged?: boolean
}

const legacyPayload = ({ author, mergedBy, merged = true }: LegacyInput) => ({
	action: 'closed',
	number: 7,
	pull_request: {
		merged,
		merged_at: merged ? '2026-10-03T14:59:00Z' : null,
		user: { login: login(author) },
		merged_by: mergedBy ? { login: login(mergedBy) } : null,
	},
})

describe('classifyMerge', () => {
	it('is own-repo when the author owns the repository, ignoring case', () => {
		expect(
			classifyMerge({ author: 'Alice', owner: 'alice', mergedBy: 'alice' })
		).toBe('ownRepo')
	})

	it('is self-merged when the author merged into a repository they do not own', () => {
		expect(
			classifyMerge({ author: 'bob', owner: 'acme', mergedBy: 'Bob' })
		).toBe('selfMerged')
	})

	it('is merged when someone else merged', () => {
		expect(
			classifyMerge({ author: 'carol', owner: 'acme', mergedBy: 'dave' })
		).toBe('merged')
	})

	it('treats an unknown merger as someone else', () => {
		expect(
			classifyMerge({ author: 'carol', owner: 'acme', mergedBy: undefined })
		).toBe('merged')
	})
})

describe('toMergeEvent', () => {
	it('reads a trimmed merged event with the actor as author', () => {
		expect(
			toMergeEvent(
				pullRequestEvent({ payload: { action: 'merged', number: 3 } })
			)
		).toEqual({
			author: 'alice',
			repository: 'acme/widgets',
			repositoryId: 101,
			owner: 'acme',
			mergedBy: undefined,
			mergedAt: '2026-10-03T15:00:00Z',
			number: 3,
			mergeKind: 'merged',
		})
	})

	it('reads a legacy merged event with author and merger from the payload', () => {
		expect(
			toMergeEvent(
				pullRequestEvent({
					actor: 'dave',
					payload: legacyPayload({ author: 'carol', mergedBy: 'dave' }),
				})
			)
		).toMatchObject({
			author: 'carol',
			mergedBy: 'dave',
			mergedAt: '2026-10-03T14:59:00Z',
			mergeKind: 'merged',
		})
	})

	it('classifies a legacy self-merge', () => {
		expect(
			toMergeEvent(
				pullRequestEvent({
					payload: legacyPayload({ author: 'bob', mergedBy: 'bob' }),
				})
			)?.mergeKind
		).toBe('selfMerged')
	})

	it('classifies a merge into the author own repository', () => {
		expect(
			toMergeEvent(
				pullRequestEvent({
					repository: 'Alice/dotfiles',
					payload: { action: 'merged', number: 1 },
				})
			)?.mergeKind
		).toBe('ownRepo')
	})

	it('keeps bot authors; ingest excludes them after classification', () => {
		expect(
			toMergeEvent(
				pullRequestEvent({
					actor: 'dependabot[bot]',
					payload: { action: 'merged', number: 2 },
				})
			)?.author
		).toBe('dependabot[bot]')
	})

	it('ignores a legacy closed pull request that was not merged', () => {
		expect(
			toMergeEvent(
				pullRequestEvent({
					payload: legacyPayload({ author: 'erin', merged: false }),
				})
			)
		).toBeUndefined()
	})

	it.each(['opened', 'closed', 'labeled', 'reopened'])(
		'ignores a trimmed %s event',
		action => {
			expect(
				toMergeEvent(pullRequestEvent({ payload: { action, number: 1 } }))
			).toBeUndefined()
		}
	)
})
