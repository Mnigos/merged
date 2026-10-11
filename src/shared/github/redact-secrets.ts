const TOKEN_LIKE = /\b(?:bearer|token)\s+\S+|\b(?:gh[oprsu]_|github_pat_)\w+/giu

/** `text` without the token itself, `Bearer …`/`token …` values and GitHub token-shaped strings. */
export const redactSecrets = (text: string, secret: string) =>
	(secret ? text.replaceAll(secret, '[redacted]') : text).replace(
		TOKEN_LIKE,
		'[redacted]'
	)
