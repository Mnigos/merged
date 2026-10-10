/** Login suffix GitHub gives to app and bot accounts. */
export const BOT_SUFFIX = '[bot]'

/** Known bot logins that no pattern catches, lowercase. */
export const BOT_LOGINS: ReadonlySet<string> = new Set([
	'dependabot',
	'renovate',
	'github-actions',
	'snyk-bot',
	'imgbot',
	'allcontributors',
	'copilot',
	'release-service-bot',
	'regro-cf-autotick-bot',
	'svc-excavator-bot',
	'brewtestbot',
	'openshift-cherrypick-robot',
	'tscircuitbot',
	'redhat-chai-bot',
	'fbc-release-e2e-bot',
	'openshift-merge-robot',
	'k8s-ci-robot',
	'mergify',
	'web-flow',
	'weblate',
	'scala-steward',
	'wingetbot',
	'unownbot',
	'intent-hq-ci',
	'codecov-commenter',
	'pre-commit-ci',
	'sonarcloud',
	'netlify',
	'vercel',
	'r-ryantm',
	'juliaregistrator',
])

/** Automation words a `…bot` login may start with, such as `releasebot` or `ci-helperbot`. */
export const BOT_LOGIN_PREFIXES = [
	'test',
	'ci',
	'release',
	'build',
	'auto',
	'svc',
	'service',
	'deploy',
	'merge',
	'sync',
	'update',
	'cherrypick',
	'backport',
	'renovate',
	'dependa',
	'github',
	'gitlab',
	'publish',
] as const satisfies readonly string[]

const SEPARATED_BOT_SUFFIX = /[-_.]bot$/u
const SEPARATED_CI_SUFFIX = /[-_]ci$/u
const DIGIT_BOT_SUFFIX = /\dbot$/u
const LOGIN_TOKEN_SEPARATOR = /[-_.]/u

function hasBotPattern(login: string) {
	if (login.endsWith(BOT_SUFFIX) || login.endsWith('robot')) return true
	if (SEPARATED_BOT_SUFFIX.test(login) || DIGIT_BOT_SUFFIX.test(login))
		return true
	if (SEPARATED_CI_SUFFIX.test(login)) return true
	if (['svc-', 'bot-', 'ci-'].some(prefix => login.startsWith(prefix)))
		return true
	if (login.split(LOGIN_TOKEN_SEPARATOR).includes('copilot')) return true

	return (
		login.endsWith('bot') &&
		BOT_LOGIN_PREFIXES.some(prefix => login.startsWith(prefix))
	)
}

/**
 * True for logins excluded as bots, compared lowercase:
 * - the `[bot]` suffix GitHub gives app accounts;
 * - ending in `-bot`, `_bot`, `.bot` or `robot`, or in `bot` right after a digit;
 * - ending in `bot` and starting with an automation word (`BOT_LOGIN_PREFIXES`);
 * - ending in `-ci` or `_ci`;
 * - starting with `svc-`, `bot-` or `ci-`;
 * - `copilot` as a token between `-`, `_` or `.` (`copilot-swe-agent`);
 * - a known bot login (`BOT_LOGINS`).
 *
 * A bare `bot` ending after letters stays human, so surnames such as `talbot`,
 * `abbot` or `cabot` are not excluded.
 */
export function isBot(login: string) {
	const normalized = login.toLowerCase()

	return BOT_LOGINS.has(normalized) || hasBotPattern(normalized)
}
