import { describe, expect, it } from '@effect/vitest'
import { parseSearch, stringifySearch } from './router-search.helper'

describe('parseSearch', () => {
	it.each(['true', 'null', '1e3', '007', '@mnigos'])(
		'keeps login=%s as text',
		login => {
			expect(parseSearch(`?login=${encodeURIComponent(login)}`)).toEqual({
				login,
			})
		}
	)

	it('still parses other values as JSON', () => {
		expect(parseSearch('?board=pl&rows=100')).toEqual({
			board: 'pl',
			rows: 100,
		})
		expect(parseSearch('?board=no')).toEqual({ board: 'no' })
	})
})

describe('stringifySearch', () => {
	it.each(['1e3', '007', 'true', 'mnigos'])(
		'round-trips login=%s unquoted',
		login => {
			const searchString = stringifySearch({ login })

			expect(searchString).toBe(`?login=${login}`)
			expect(parseSearch(searchString)).toEqual({ login })
		}
	)

	it('keeps JSON values and drops an empty search', () => {
		expect(stringifySearch({ board: 'pl', rows: 100 })).toBe(
			'?board=pl&rows=100'
		)
		expect(parseSearch(stringifySearch({ board: 'pl', rows: 100 }))).toEqual({
			board: 'pl',
			rows: 100,
		})
		expect(stringifySearch({})).toBe('')
	})
})
