import { isoDateSchema } from '@shared/schema/iso-date.schema'
import { seasonIdSchema } from '@shared/schema/season-id.schema'
import { Result, Schema } from 'effect'
import { toStorageSegments } from './storage-path.helper'
import { StorageError } from './storage.error'

/** A data file's place in the data repository: release tag and asset name. */
export interface ReleaseAsset {
	readonly tag: string
	readonly asset: string
}

const DAY_FILE = /^(.+)\.json$/u
const isIsoDate = Schema.is(isoDateSchema)
const isSeasonId = Schema.is(seasonIdSchema)

/**
 * Release tag and asset name of a storage path:
 * - `days/<YYYY-MM-DD>.json` → tag `days-<YYYY-MM>`, asset `<YYYY-MM-DD>.json`
 * - `seasons/index.json` → tag `index`, asset `index.json`
 * - `seasons/<YYYY-MM>/<rest>` → tag `season-<YYYY-MM>`, asset `<rest>` with
 *   `/` replaced by `-` (`tabs/global.json` → `tabs-global.json`,
 *   `shards/2f.json` → `shards-2f.json`)
 *
 * Dates must be real calendar days and seasons real months (`01`–`12`).
 * Any other path fails with `StorageError`.
 */
export function toReleaseAsset(
	path: string
): Result.Result<ReleaseAsset, StorageError> {
	const unsupported = Result.fail(
		new StorageError({
			path,
			message: `${path}: no release asset for this path`,
		})
	)

	return Result.flatMap(toStorageSegments(path), segments => {
		const [root, first, ...rest] = segments
		if (root === 'days' && first !== undefined && rest.length === 0) {
			const date = DAY_FILE.exec(first)?.[1]

			return date && isIsoDate(date)
				? Result.succeed({ tag: `days-${date.slice(0, 7)}`, asset: first })
				: unsupported
		}
		if (root !== 'seasons' || first === undefined) return unsupported
		if (first === 'index.json' && rest.length === 0)
			return Result.succeed({ tag: 'index', asset: 'index.json' })
		if (!isSeasonId(first) || rest.length === 0) return unsupported

		return Result.succeed({ tag: `season-${first}`, asset: rest.join('-') })
	})
}
