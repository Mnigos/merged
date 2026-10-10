import { describe, expect, it } from '@effect/vitest'
import { parseSearch, stringifySearch } from './router-search'

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
		expect(parseSearch('?board=poland&rows=100')).toEqual({
			board: 'poland',
			rows: 100,
		})
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
		expect(
			parseSearch(stringifySearch({ board: 'poland', rows: 100 }))
		).toEqual({ board: 'poland', rows: 100 })
		expect(stringifySearch({})).toBe('')
	})
})
