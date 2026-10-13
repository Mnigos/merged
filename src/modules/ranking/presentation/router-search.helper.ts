import { parseSearchWith, stringifySearchWith } from '@tanstack/react-router'

/** Search keys kept as typed text: a login such as `1e3`, `007` or `true` is not JSON. */
export const RAW_SEARCH_KEYS = ['login'] as const

const parseJsonSearch = parseSearchWith(JSON.parse)
const stringifyJsonSearch = stringifySearchWith(JSON.stringify)

/** The router's search parser: JSON values as usual, raw text for `RAW_SEARCH_KEYS`. */
export function parseSearch(searchString: string): Record<string, unknown> {
	const params = new URLSearchParams(searchString)
	const raw = RAW_SEARCH_KEYS.flatMap(key => {
		const value = params.get(key)

		return value === null ? [] : [[key, value] as const]
	})

	return { ...parseJsonSearch(searchString), ...Object.fromEntries(raw) }
}

/** The router's search serializer, the inverse of `parseSearch`. */
export function stringifySearch(search: Record<string, unknown>) {
	const rawEntries = RAW_SEARCH_KEYS.flatMap(key => {
		const value = search[key]

		return typeof value === 'string' ? [[key, value] as const] : []
	})
	const rest = Object.fromEntries(
		Object.entries(search).filter(
			([key]) => !rawEntries.some(([rawKey]) => rawKey === key)
		)
	)
	const params = new URLSearchParams(stringifyJsonSearch(rest))
	for (const [key, value] of rawEntries) params.set(key, value)
	const query = params.toString()

	return query ? `?${query}` : ''
}
