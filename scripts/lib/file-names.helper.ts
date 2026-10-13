/** Role suffixes a source file under `src/` or `scripts/` may end with, as in `scoring.helper.ts`. */
export const FILE_ROLE_SUFFIXES = [
	'model',
	'helper',
	'file',
	'schema',
	'service',
	'port',
	'error',
	'layer',
	'functions',
	'server',
	'spec',
	'mock',
	'report',
	'store',
	'source',
	'storage',
	'http',
	'config',
	'component',
	'hook',
	'util',
] as const satisfies readonly string[]

/** Source files exempt from a role suffix: TanStack file routes and router, generated files, script entrypoints. */
const EXEMPT_PATHS = [
	/^src\/routes\//u,
	/^src\/styles\//u,
	/^src\/router\.tsx$/u,
	/\.gen\.ts$/u,
	/^scripts\/[^/]+\.ts$/u,
] as const satisfies readonly RegExp[]

const SOURCE_FILE = /\.tsx?$/u
const ROLE_SUFFIX = new RegExp(
	`\\.(${FILE_ROLE_SUFFIXES.join('|')})\\.tsx?$`,
	'u'
)

/**
 * Whether a repo-relative POSIX path breaks the file naming rule: a `.ts` or
 * `.tsx` file that is not exempt and does not end with a role suffix.
 */
export function lacksRoleSuffix(path: string) {
	if (!SOURCE_FILE.test(path)) return false
	if (EXEMPT_PATHS.some(pattern => pattern.test(path))) return false

	return !ROLE_SUFFIX.test(path)
}
