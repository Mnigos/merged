import { describe, expect, it } from '@effect/vitest'
import {
	HOME_SEARCH_DEFAULTS,
	toHomeSearch,
	toLookupSearch,
	toLookupTarget,
} from './search-params'

describe('toHomeSearch', () => {
	it('defaults to the Global board, top 25', () => {
		expect(toHomeSearch({})).toEqual({ board: 'global', rows: 25 })
	})

	it('keeps a valid board and row count', () => {
		expect(toHomeSearch({ board: 'repositories', rows: 100 })).toEqual({
			board: 'repositories',
			rows: 100,
		})
	})

	it('falls back on values the URL can carry but the page does not know', () => {
		expect(toHomeSearch({ board: 'rust', rows: 50 })).toEqual(
			HOME_SEARCH_DEFAULTS
		)
		expect(toHomeSearch({ board: ['global'], rows: '100' })).toEqual(
			HOME_SEARCH_DEFAULTS
		)
	})

	it.each([25, 100])('accepts %d rows on the Poland board', rows => {
		expect(toHomeSearch({ board: 'poland', rows })).toEqual({
			board: 'poland',
			rows,
		})
	})

	it.each([
		0,
		24,
		26,
		99,
		101,
		-25,
		25.5,
		'25',
		null,
		true,
		[],
		{},
		Number.NaN,
		Infinity,
	])('defaults invalid rows %j without discarding a valid board', rows => {
		expect(toHomeSearch({ board: 'poland', rows })).toEqual({
			board: 'poland',
			rows: 25,
		})
	})

	it.each([null, true, {}, 'constructor', '__proto__', 'GLOBAL'])(
		'defaults invalid board %j without discarding a valid row count',
		board => {
			expect(toHomeSearch({ board, rows: 100 })).toEqual({
				board: 'global',
				rows: 100,
			})
		}
	)
})

describe('toLookupSearch', () => {
	it('keeps a string login', () => {
		expect(toLookupSearch({ login: 'steipete' })).toEqual({
			login: 'steipete',
		})
	})

	it.each([true, null, 1000, Number.NaN, { a: 1 }, ['x'], undefined])(
		'treats the parsed value %j as empty',
		login => {
			expect(toLookupSearch({ login })).toEqual({})
		}
	)
})

describe('toLookupTarget', () => {
	it.each([
		['?login=true', 'true'],
		['?login=null', 'null'],
		['?login=1e3', '1e3'],
		['?login=007', '007'],
		['?login=%40mnigos', 'mnigos'],
		['?login=https%3A%2F%2Fgithub.com%2Fmnigos%2F', 'mnigos'],
		['?login=+Steipete+', 'steipete'],
		[`?login=${'a'.repeat(40)}`, 'a'.repeat(40)],
		['?login=not+a+login', 'not a login'],
	])('reads %s as %s', (searchString, login) => {
		expect(toLookupTarget(searchString)).toBe(login)
	})

	it.each(['', '?login=', '?login=+++', '?other=1'])(
		'has no target for %j',
		searchString => {
			expect(toLookupTarget(searchString)).toBeUndefined()
		}
	)
})
