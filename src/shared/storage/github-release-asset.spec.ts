import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { toReleaseAsset } from './github-release-asset'

describe('toReleaseAsset', () => {
	it.each([
		['days/2026-10-01.json', 'days-2026-10', '2026-10-01.json'],
		['days/2026-10-03.json', 'days-2026-10', '2026-10-03.json'],
		['seasons/index.json', 'index', 'index.json'],
		['seasons/2026-10/repos.json', 'season-2026-10', 'repos.json'],
		['seasons/2026-10/candidates.json', 'season-2026-10', 'candidates.json'],
		['seasons/2026-10/tabs/global.json', 'season-2026-10', 'tabs-global.json'],
		['seasons/2026-10/shards/2f.json', 'season-2026-10', 'shards-2f.json'],
		['seasons/2026-10/shards/7f.json', 'season-2026-10', 'shards-7f.json'],
	])('maps %s to %s / %s', (path, tag, asset) => {
		expect(toReleaseAsset(path)).toEqual(Result.succeed({ tag, asset }))
	})

	it.each([
		'foo.json',
		'days/2026-10-1.json',
		'days/2026-02-30.json',
		'days/2026-13-01.json',
		'seasons/2026-00/repos.json',
		'../x',
		'days/2026-10.json',
		'days/2026-10-03.txt',
		'days/2026/10-03.json',
		'seasons/2026-10',
		'seasons/2026-10.json',
		'seasons/current/repos.json',
		'seasons/index.json/extra',
		'other/file.json',
		'index.json',
		'../days/2026-10-03.json',
		'/days/2026-10-03.json',
	])('rejects %j', path => {
		const result = toReleaseAsset(path)

		expect(Result.isFailure(result)).toBeTruthy()
		if (Result.isFailure(result))
			expect(result.failure).toMatchObject({ _tag: 'StorageError', path })
	})

	it('rejects an out-of-range season month', () => {
		const path = 'seasons/2026-13/x.json'
		const result = toReleaseAsset(path)

		expect(Result.isFailure(result)).toBeTruthy()
		if (Result.isFailure(result))
			expect(result.failure).toMatchObject({ _tag: 'StorageError', path })
	})
})
