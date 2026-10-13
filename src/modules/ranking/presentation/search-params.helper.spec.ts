import { describe, expect, it } from '@effect/vitest'
import {
	HOME_SEARCH_DEFAULTS,
	toHomeSearch,
	toLookupSearch,
	toLookupTarget,
	toShownBoard,
} from './search-params.helper'

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

	it.each([25, 100])('accepts %d rows on a country board', rows => {
		expect(toHomeSearch({ board: 'pl', rows })).toEqual({
			board: 'pl',
			rows,
		})
	})

	it.each(['pl', 'de', 'us', 'no', 'zz'])(
		'keeps the country code %j for the loader to check',
		board => {
			expect(toHomeSearch({ board }).board).toBe(board)
		}
	)

	it('reads the Poland board of old links as the country board pl', () => {
		expect(toHomeSearch({ board: 'poland', rows: 100 })).toEqual({
			board: 'pl',
			rows: 100,
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
		expect(toHomeSearch({ board: 'pl', rows })).toEqual({
			board: 'pl',
			rows: 25,
		})
	})

	it.each([
		null,
		true,
		{},
		'constructor',
		'__proto__',
		'GLOBAL',
		'PL',
		'pol',
		'p',
		'p1',
		'',
	])(
		'defaults invalid board %j without discarding a valid row count',
		board => {
			expect(toHomeSearch({ board, rows: 100 })).toEqual({
				board: 'global',
				rows: 100,
			})
		}
	)
})

describe('toShownBoard', () => {
	const countries = [{ code: 'pl' }, { code: 'de' }]

	it.each(['global', 'repositories', 'pl', 'de'])(
		'shows %j when the season has it',
		board => {
			expect(toShownBoard(board, countries)).toBe(board)
		}
	)

	it.each(['is', 'zz'])('shows Global for %j without a board', board => {
		expect(toShownBoard(board, countries)).toBe('global')
	})

	it('shows Global for every country before country boards were published', () => {
		expect(toShownBoard('pl', [])).toBe('global')
	})
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
