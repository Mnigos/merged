import type { SearchSchemaInput } from '@tanstack/react-router'
import { toLookupLogin } from './lookup-login.helper'

/** Boards every season has; country boards come from the season index. */
export const BOARD_IDS = ['global', 'repositories'] as const

/**
 * A tab of the leaderboard: Global, Repositories, or a country board by its
 * lowercase ISO 3166-1 alpha-2 code such as `pl`. Whether a country has a
 * board this season is checked against the season index when `/` loads.
 */
export type BoardId =
	| (typeof BOARD_IDS)[number]
	| (string & Record<never, never>)

const COUNTRY_BOARD_ID = /^[a-z]{2}$/u

/** Board ids of shared links from before country boards, and the board they meant. */
const LEGACY_BOARD_IDS: ReadonlyMap<string, BoardId> = new Map([
	['poland', 'pl'],
])

/** Rows a board can show: the top 25 or the whole top 100. */
export const ROW_COUNTS = [25, 100] as const

/** Rows shown on a board: the top 25 or the whole top 100. */
export type RowCount = (typeof ROW_COUNTS)[number]

export interface HomeSearch {
	readonly board: BoardId
	readonly rows: RowCount
}

/** Search params of `/` when absent; also stripped from links. */
export const HOME_SEARCH_DEFAULTS = {
	board: 'global',
	rows: 25,
} as const satisfies HomeSearch

function toBoardId(value: unknown): BoardId | undefined {
	if (typeof value !== 'string') return undefined
	const legacy = LEGACY_BOARD_IDS.get(value)
	if (legacy) return legacy
	if (BOARD_IDS.some(board => board === value) || COUNTRY_BOARD_ID.test(value))
		return value

	return undefined
}

const isRowCount = (value: unknown): value is RowCount =>
	ROW_COUNTS.some(rows => rows === value)

/**
 * Search params of `/` from parsed URL params: unknown or missing values fall
 * back to the defaults, `poland` from old links becomes `pl`. Plain checks,
 * so no Schema code ships to the browser.
 */
export const toHomeSearch = (
	search: Readonly<Record<string, unknown>>
): HomeSearch => ({
	board: toBoardId(search.board) ?? HOME_SEARCH_DEFAULTS.board,
	rows: isRowCount(search.rows) ? search.rows : HOME_SEARCH_DEFAULTS.rows,
})

interface BoardCountry {
	readonly code: string
}

/**
 * The board `/` shows for `?board=`: Global and Repositories always, a
 * country only when it has a board this season (`countries` of the season
 * index), otherwise Global.
 */
export const toShownBoard = (
	board: BoardId,
	countries: readonly BoardCountry[]
): BoardId =>
	BOARD_IDS.some(id => id === board) ||
	countries.some(country => country.code === board)
		? board
		: 'global'

export interface LookupSearch {
	readonly login?: string
}

/**
 * Search params of `/u` from parsed URL params. Only a string counts: the
 * router JSON-parses values, so `true`, `null` or `1e3` arrive as other types
 * and are read from the raw query by `toLookupTarget` instead.
 */
export const toLookupSearch = (
	search: Readonly<Record<string, unknown>>
): LookupSearch =>
	typeof search.login === 'string' ? { login: search.login } : {}

/**
 * Where the no-JS lookup form leads, from the raw query string such as
 * `?login=%40mnigos`: the normalized login, the trimmed input as typed when
 * it is not a login (its page explains why), or `undefined` when empty.
 * Reads `URLSearchParams`, so `007`, `1e3` and `true` stay text.
 */
export function toLookupTarget(searchString: string) {
	const input = new URLSearchParams(searchString).get('login')?.trim() ?? ''
	if (!input) return undefined

	return toLookupLogin(input) ?? input
}

/** `validateSearch` of `/`; links may leave out either param. */
export const validateHomeSearch = (
	search: Partial<HomeSearch> & SearchSchemaInput
) => toHomeSearch(search)

/** `validateSearch` of `/u`. */
export const validateLookupSearch = (
	search: Partial<LookupSearch> & SearchSchemaInput
) => toLookupSearch(search)
