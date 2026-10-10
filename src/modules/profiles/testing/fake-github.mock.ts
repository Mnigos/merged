import type {
	GraphqlError,
	GraphqlResponse,
} from '@shared/github/github-graphql.port'
import type { GraphqlHandler } from '@shared/github/testing/in-memory-github-graphql'

export interface FakeUser {
	readonly name?: string | null
	readonly location?: string | null
	readonly company?: string | null
}

/** What the fake GitHub knows; anything absent is `NOT_FOUND`. */
export interface FakeGitHub {
	/** Lowercase `owner/name` → stars and language. */
	readonly repositories?: Readonly<
		Record<string, { readonly stars: number; readonly language?: string }>
	>
	/** Lowercase login → profile. */
	readonly users?: Readonly<Record<string, FakeUser>>
	/** `owner/name#number` → merger login as GitHub spells it, `null` for a merged pull request without a known merger. */
	readonly pullRequests?: Readonly<Record<string, string | null>>
	/** Keys (`owner/name`, login, `owner/name#number`) answered with a `FORBIDDEN` error. */
	readonly forbidden?: readonly string[]
	/** `rateLimit.remaining` reported by every query. */
	readonly remaining?: number
}

type Kind = 'repository' | 'user' | 'pullRequest'

const kindOf = (document: string): Kind =>
	document.includes('user(')
		? 'user'
		: document.includes('pullRequest(')
			? 'pullRequest'
			: 'repository'

function answer(
	fake: FakeGitHub,
	kind: Kind,
	variables: Readonly<Record<string, unknown>>,
	index: number
) {
	const owner = String(variables[`owner${index}`])
	const name = String(variables[`name${index}`])
	const repository = `${owner}/${name}`

	if (kind === 'user') {
		const login = String(variables[`login${index}`])
		const user = fake.users?.[login]

		return {
			key: login,
			node: user && {
				login: login.toUpperCase(),
				name: user.name ?? null,
				location: user.location ?? null,
				company: user.company ?? null,
				avatarUrl: `https://avatars.example/${login}`,
			},
		}
	}
	if (kind === 'repository') {
		const found = fake.repositories?.[repository]

		return {
			key: repository,
			node: found && {
				nameWithOwner: repository,
				stargazerCount: found.stars,
				primaryLanguage: found.language ? { name: found.language } : null,
			},
		}
	}
	const key = `${repository}#${String(variables[`number${index}`])}`
	const merger = fake.pullRequests?.[key]

	return {
		key,
		node:
			merger === undefined
				? undefined
				: {
						pullRequest: {
							merged: true,
							mergedBy: merger === null ? null : { login: merger },
						},
					},
	}
}

/**
 * GraphQL handler answering the profile batch queries like GitHub: unknown
 * nodes are `null` plus a `NOT_FOUND` error under their alias, forbidden ones
 * `null` plus `FORBIDDEN`. Every query costs 1 point.
 */
export const fakeGitHubHandler =
	(fake: FakeGitHub): GraphqlHandler =>
	(document, variables): GraphqlResponse => {
		const kind = kindOf(document)
		const data: Record<string, unknown> = {
			rateLimit: {
				cost: 1,
				remaining: fake.remaining ?? 4000,
				resetAt: '2026-10-10T16:00:00Z',
			},
		}
		const errors: GraphqlError[] = []
		for (
			let index = 0;
			`owner${index}` in variables || `login${index}` in variables;
			index++
		) {
			const alias = `a${index}`
			const { key, node } = answer(fake, kind, variables, index)
			if (fake.forbidden?.includes(key)) {
				data[alias] = null
				errors.push({ type: 'FORBIDDEN', path: [alias], message: 'forbidden' })
			} else if (node === undefined) {
				data[alias] = kind === 'pullRequest' ? { pullRequest: null } : null
				errors.push({
					type: 'NOT_FOUND',
					path: kind === 'pullRequest' ? [alias, 'pullRequest'] : [alias],
					message: `Could not resolve ${key}`,
				})
			} else data[alias] = node
		}

		return { data, errors }
	}
