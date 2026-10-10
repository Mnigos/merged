import { Result } from 'effect'
import { StorageError } from './storage.error'

const PATH_SEGMENT = /^[\w.-]+$/u

/**
 * Validates a POSIX-relative storage path and returns its segments: no leading
 * slash, no empty, `.` or `..` segments, only word characters, dots and dashes.
 */
export function toStorageSegments(
	path: string
): Result.Result<readonly string[], StorageError> {
	const segments = path.split('/')
	const valid = segments.every(
		segment => PATH_SEGMENT.test(segment) && segment !== '.' && segment !== '..'
	)
	if (!valid)
		return Result.fail(
			new StorageError({ path, message: `Invalid storage path "${path}"` })
		)

	return Result.succeed(segments)
}
