import type { SearchSchemaInput } from '@tanstack/react-router'
import { toLookupLogin } from './lookup-login'

/** Tabs of the leaderboard: the contributor boards and the repository board. */
export const BOARD_IDS = ['global', 'poland', 'repositories'] as const

/** A tab of the leaderboard: a contributor board or the repository board. */
export type BoardId = (typeof BOARD_IDS)[number]

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

const isBoardId = (value: unknown): value is BoardId =>
	BOARD_IDS.some(board => board === value)

const isRowCount = (value: unknown): value is RowCount =>
	ROW_COUNTS.some(rows => rows === value)

/**
 * Search params of `/` from parsed URL params: unknown or missing values fall
 * back to the defaults. Plain checks, so no Schema code ships to the browser.
 */
export const toHomeSearch = (
	search: Readonly<Record<string, unknown>>
): HomeSearch => ({
	board: isBoardId(search.board) ? search.board : HOME_SEARCH_DEFAULTS.board,
	rows: isRowCount(search.rows) ? search.rows : HOME_SEARCH_DEFAULTS.rows,
})

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
