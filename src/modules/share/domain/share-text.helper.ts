const NUMBER_FORMAT = new Intl.NumberFormat('en-US')

/** Site name used in share texts. */
export const SITE_NAME = 'merged'

export interface ShareTextInput {
	/** Merged pull requests, self-merged included. */
	readonly mergedPullRequests: number
	readonly repositories: number
	/** Season name such as `October 2026`. */
	readonly seasonName: string
	readonly rank: number
	/** Contributors ranked in the season. */
	readonly contributors: number
	/** Rank on the Poland board, when the contributor is on it. */
	readonly polandRank?: number | null
}

const times = (count: number) =>
	count === 1 ? 'once' : `${NUMBER_FORMAT.format(count)} times`

const repositories = (count: number) =>
	`${NUMBER_FORMAT.format(count)} ${count === 1 ? 'repository' : 'repositories'}`

const polandStanding = (polandRank: number | null | undefined) =>
	polandRank ? ` and #${NUMBER_FORMAT.format(polandRank)} in Poland` : ''

/**
 * Prefilled first-person post for a ranked contributor:
 * "I got merged 41 times into 8 repositories in October 2026, #4 of 6,853
 * on merged", with " and #2 in Poland" after the rank when on that board.
 */
export const toShareText = (input: ShareTextInput) =>
	`I got merged ${times(input.mergedPullRequests)} into ${repositories(input.repositories)} in ${input.seasonName}, #${NUMBER_FORMAT.format(input.rank)} of ${NUMBER_FORMAT.format(input.contributors)}${polandStanding(input.polandRank)} on ${SITE_NAME}`

export interface XIntentInput {
	readonly text: string
	readonly url: string
}

/** Link that opens X's composer with the text and URL filled in. */
export function toXIntentUrl({ text, url }: XIntentInput) {
	const intent = new URL('https://x.com/intent/tweet')
	intent.searchParams.set('text', text)
	intent.searchParams.set('url', url)

	return intent.href
}
