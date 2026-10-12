import { describe, expect, it } from '@effect/vitest'
import { inMemoryGitHubGraphqlLayer } from '@shared/github/testing/in-memory-github-graphql'
import { isoDateSchema } from '@shared/schema/iso-date'
import { Effect, Layer, Option } from 'effect'
import { DayStore } from '../../application/day-store.port'
import { IngestDay } from '../../application/ingest-day.service'
import type { IngestSource } from '../../application/ingest-source.port'
import {
	fakeGitHubSearchHandler,
	fakePullRequest,
	type FakePullRequest,
} from '../../testing/fake-github-search.mock'
import { inMemoryArchiveIngestSourceLayer } from '../../testing/in-memory-archive-source'
import { inMemoryDayPartStoreLayer } from '../../testing/in-memory-day-part-store'
import { inMemoryDayStoreLayer } from '../../testing/in-memory-day-store'
import { toGithubSearchIngestSourceLayer } from './github-search-ingest-source'

const date = isoDateSchema.make('2026-10-01')

const pullRequests: readonly FakePullRequest[] = [
	fakePullRequest({
		number: 1,
		mergedAt: '2026-10-01T03:00:01Z',
		repository: 'Acme/Widgets',
		author: 'Alice',
		mergedBy: 'bob',
	}),
	fakePullRequest({
		number: 2,
		mergedAt: '2026-10-01T03:20:00Z',
		repository: 'Acme/Widgets',
		author: 'alice',
		mergedBy: 'Alice',
	}),
	fakePullRequest({
		number: 3,
		mergedAt: '2026-10-01T03:59:59Z',
		repository: 'carol/tool',
		author: 'carol',
		mergedBy: 'carol',
	}),
	fakePullRequest({
		number: 4,
		mergedAt: '2026-10-01T04:00:00Z',
		repository: 'acme/gadgets',
		author: 'dave',
	}),
	fakePullRequest({
		number: 5,
		mergedAt: '2026-10-01T04:30:00Z',
		repository: 'acme/gadgets',
		author: 'Alice',
		mergedBy: 'dave',
	}),
	fakePullRequest({
		number: 6,
		mergedAt: '2026-10-01T04:30:00Z',
		repository: 'acme/widgets',
		author: 'renovate[bot]',
		mergedBy: 'bob',
	}),
	fakePullRequest({
		number: 7,
		mergedAt: '2026-10-01T04:31:00Z',
		repository: 'acme/widgets',
		author: null,
		mergedBy: 'bob',
	}),
]

/** The same merge as a GH Archive `closed` line, the format that still names the merger. */
const toArchiveLine = ({
	number,
	mergedAt,
	author,
	mergedBy,
	repository,
}: FakePullRequest) =>
	JSON.stringify({
		type: 'PullRequestEvent',
		actor: { login: mergedBy?.login ?? 'someone' },
		repo: { id: repository.databaseId, name: repository.nameWithOwner },
		created_at: mergedAt,
		payload: {
			action: 'closed',
			number,
			pull_request: {
				merged: true,
				merged_at: mergedAt,
				merged_by: mergedBy,
				user: author && { login: author.login },
			},
		},
	})

const archiveHours = new Map(
	[3, 4].map(hour => [
		hour,
		pullRequests
			.filter(
				pullRequest => new Date(pullRequest.mergedAt).getUTCHours() === hour
			)
			.map(toArchiveLine)
			.join('\n'),
	])
)

const ingestWith = (sourceLayer: Layer.Layer<IngestSource>) =>
	Effect.gen(function* () {
		const metrics = yield* (yield* IngestDay).ingest(date, { hours: [3, 4] })

		return {
			metrics,
			aggregate: Option.getOrThrow(yield* (yield* DayStore).read(date)),
		}
	}).pipe(
		Effect.provide(
			IngestDay.layer.pipe(
				Layer.provideMerge(
					Layer.mergeAll(
						sourceLayer,
						inMemoryDayStoreLayer,
						inMemoryDayPartStoreLayer
					)
				)
			)
		)
	)

describe('ingest sources', () => {
	it.effect(
		'write the same daily aggregate from the archive and from search for the same merges',
		() =>
			Effect.gen(function* () {
				const archive = yield* ingestWith(
					inMemoryArchiveIngestSourceLayer(archiveHours)
				)
				const search = yield* ingestWith(
					toGithubSearchIngestSourceLayer().pipe(
						Layer.provide(
							inMemoryGitHubGraphqlLayer(fakeGitHubSearchHandler(pullRequests))
						)
					)
				)

				expect(search.aggregate).toEqual(archive.aggregate)
				expect(search.aggregate.totals).toEqual({
					merged: 3,
					selfMerged: 1,
					ownRepo: 1,
					stars: 0,
				})
				expect(search.metrics).toMatchObject({
					merges: archive.metrics.merges,
					mergesWithoutMerger: 1,
					botEvents: 1,
					ignoredEvents: 1,
					requests: 120,
				})
				expect(archive.metrics).toMatchObject({
					botEvents: 1,
					ignoredEvents: 1,
					requests: 2,
				})
			})
	)
})
