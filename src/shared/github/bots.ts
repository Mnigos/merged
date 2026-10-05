/** Login suffix GitHub gives to app and bot accounts. */
export const BOT_SUFFIX = '[bot]'

/** Known bot logins without the `[bot]` suffix, lowercase. */
export const BOT_LOGINS: ReadonlySet<string> = new Set([
	'dependabot',
	'renovate',
	'github-actions',
	'snyk-bot',
	'imgbot',
	'allcontributors',
])

/** True for logins excluded as bots: a `[bot]` suffix or a known bot login. */
export function isBot(login: string) {
	const normalized = login.toLowerCase()

	return normalized.endsWith(BOT_SUFFIX) || BOT_LOGINS.has(normalized)
}
