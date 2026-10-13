import { CITIES } from './cities.model'
import {
	COUNTRIES,
	findCountry,
	MULTI_COUNTRY_PHRASES,
	type CountryCode,
	type CountryEntry,
} from './countries.model'

/** Kinds of phrase in the order they decide a location's country, after flags. */
export const PHRASE_TIERS = ['country', 'city', 'weak'] as const

/** A kind of phrase: a country name or alias, a city, or a short ambiguous word. */
export type PhraseTier = (typeof PHRASE_TIERS)[number]

/** Letters without a decomposition into a base letter and a diacritic. */
const LETTER_REPLACEMENTS = [
	['ł', 'l'],
	['ø', 'o'],
	['đ', 'd'],
	['ð', 'd'],
	['ı', 'i'],
	['æ', 'ae'],
	['œ', 'oe'],
	['ß', 'ss'],
	['þ', 'th'],
] as const satisfies readonly (readonly [string, string])[]

const COMBINING_MARKS = /\p{M}/gu
const NON_WORD = /[^\p{L}\p{N}]+/u
/** Scripts written without spaces between words: their phrases match anywhere in the text. */
const UNSPACED_SCRIPT =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}]/u
/** A flag emoji: two regional indicators, or a black flag with subdivision tags (🏴 England). */
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]{2}/gu
const REGIONAL_INDICATOR_A = 0x1_f1_e6
const TAG_LATIN_A = 0xe_00_61
/** Code point of `a`, the letter a regional indicator or tag letter maps to. */
const LETTER_A = 0x61
/** Arrows that mark a move ("Berlin -> Warsaw"): the place after the last one counts first. */
const MOVE_ARROW = /->|=>|→|⇒|⟶|➡/u

/**
 * Lowercase words of a free-text location without diacritics (`ł` and other
 * letters without a decomposition are mapped), split on anything that is not
 * a letter or digit: `"Kraków, PL"` → `['krakow', 'pl']`.
 */
export function toLocationWords(location: string) {
	let lower = location.toLowerCase()
	for (const [letter, replacement] of LETTER_REPLACEMENTS)
		lower = lower.replaceAll(letter, replacement)

	return lower
		.normalize('NFD')
		.replace(COMBINING_MARKS, '')
		.split(NON_WORD)
		.filter(Boolean)
}

interface PhraseTarget {
	readonly code: CountryCode
	readonly tier: PhraseTier
}

interface Phrase {
	/** Normalized words joined by single spaces. */
	readonly text: string
	readonly words: readonly string[]
	/** Country and tier; absent for a region spanning several countries. */
	readonly target?: PhraseTarget
}

const toPhrase = (raw: string, target?: PhraseTarget): Phrase => {
	const words = toLocationWords(raw)

	return { text: words.join(' '), words, target }
}

const CITY_LISTS: Partial<Record<CountryCode, readonly string[]>> = CITIES

function toCountryPhrases(code: CountryCode, entry: CountryEntry) {
	const weak = (entry.weakAliases ?? []).map(alias =>
		toPhrase(alias, { code, tier: 'weak' })
	)
	const isWeak = (phrase: Phrase) =>
		weak.some(weakPhrase => weakPhrase.text === phrase.text)

	return [
		...[entry.name, ...(entry.nativeNames ?? []), ...(entry.aliases ?? [])]
			.map(name => toPhrase(name, { code, tier: 'country' }))
			.filter(phrase => !isWeak(phrase)),
		...(CITY_LISTS[code] ?? []).map(city =>
			toPhrase(city, { code, tier: 'city' })
		),
		...weak,
	]
}

/** Every phrase of `COUNTRIES`, `CITIES` and `MULTI_COUNTRY_PHRASES`, normalized. */
export const LOCATION_PHRASES: readonly Phrase[] = [
	...COUNTRIES.flatMap(country => toCountryPhrases(country.code, country)),
	...MULTI_COUNTRY_PHRASES.map(region => toPhrase(region)),
].filter(phrase => phrase.text !== '')

const UNSPACED_PHRASES = LOCATION_PHRASES.filter(phrase =>
	UNSPACED_SCRIPT.test(phrase.text)
)
const PHRASES_BY_FIRST_WORD = Map.groupBy(
	LOCATION_PHRASES.filter(phrase => !UNSPACED_SCRIPT.test(phrase.text)),
	phrase => phrase.words[0] ?? ''
)

interface PhraseMatch {
	readonly start: number
	readonly end: number
	readonly phrase: Phrase
}

function findPhrases(words: readonly string[]) {
	const text = words.join(' ')
	const matches: PhraseMatch[] = []
	let offset = 0
	for (const [index, word] of words.entries()) {
		for (const phrase of PHRASES_BY_FIRST_WORD.get(word) ?? [])
			if (phrase.words.every((part, step) => words[index + step] === part))
				matches.push({
					start: offset,
					end: offset + phrase.text.length,
					phrase,
				})
		offset += word.length + 1
	}
	if (UNSPACED_SCRIPT.test(text))
		for (const phrase of UNSPACED_PHRASES) {
			const start = text.indexOf(phrase.text)
			if (start !== -1)
				matches.push({ start, end: start + phrase.text.length, phrase })
		}

	return matches
}

const isInside = (inner: PhraseMatch, outer: PhraseMatch) =>
	outer.start <= inner.start &&
	inner.end <= outer.end &&
	outer.end - outer.start > inner.end - inner.start

const byPositionThenLength = (left: PhraseMatch, right: PhraseMatch) =>
	left.start - right.start || right.end - left.end

const FLAG_LETTER = /[\u{1F1E6}-\u{1F1FF}\u{E0061}-\u{E007A}]/gu

/** Letters of a flag's regional indicators or subdivision tags: 🇵🇱 → `pl`, 🏴 England → `gb`. */
const toFlagCode = (flag: string) =>
	Array.from(flag.matchAll(FLAG_LETTER), ([symbol]) => {
		const point = symbol.codePointAt(0) ?? 0
		const base = point >= TAG_LATIN_A ? TAG_LATIN_A : REGIONAL_INDICATOR_A

		return String.fromCodePoint(LETTER_A + point - base)
	})
		.slice(0, 2)
		.join('')

function findFlagCountry(text: string) {
	for (const [flag] of text.matchAll(FLAG)) {
		const country = findCountry(toFlagCode(flag))
		if (country) return country.code
	}

	return undefined
}

const earliest = (matches: readonly PhraseMatch[]) =>
	matches.toSorted(byPositionThenLength)[0]

/** Codes such as `ca`, `nsw` or `d c`: at most three letters. */
const isCode = (phrase: Phrase) => phrase.words.join('').length <= 3

/**
 * The country of the earliest city, unless a code after it names another
 * country without naming the city's own: "Venice, CA" is in the United
 * States, "Toronto, CA" and "Sydney, NSW" stay where the city is.
 */
function findCityCountry(
	city: PhraseTarget,
	cityMatch: PhraseMatch,
	weakMatches: readonly PhraseMatch[]
) {
	const codes = weakMatches.filter(
		match => match.start > cityMatch.start && isCode(match.phrase)
	)
	const confirmsCity = codes.some(
		match =>
			match.phrase.target?.code === city.code || match.phrase.text === city.code
	)
	if (confirmsCity) return city.code

	return earliest(codes)?.phrase.target?.code ?? city.code
}

function findSegmentCountry(segment: string) {
	const flag = findFlagCountry(segment)
	if (flag) return flag
	const matches = findPhrases(toLocationWords(segment))
	const outermost = matches.filter(
		match => !matches.some(other => isInside(match, other))
	)
	const [countryMatches, cityMatches, weakMatches] = PHRASE_TIERS.map(tier =>
		outermost.filter(match => match.phrase.target?.tier === tier)
	)
	const country = earliest(countryMatches ?? [])?.phrase.target
	if (country) return country.code
	const cityMatch = earliest(cityMatches ?? [])
	if (cityMatch?.phrase.target)
		return findCityCountry(
			cityMatch.phrase.target,
			cityMatch,
			weakMatches ?? []
		)

	return earliest(weakMatches ?? [])?.phrase.target?.code
}

/**
 * Country of a free-text GitHub location, or `undefined` when it names none.
 * Checks, in order: flag emoji; country names, native names and aliases (US
 * states count as the United States); major cities; then short ambiguous
 * words such as `pl` or the USPS state codes; such a code after a city of
 * another country overrides it ("Paris, TX"). Within a kind the earliest
 * phrase in the text wins, and a phrase inside a longer one does not count
 * ("New Mexico" is not Mexico, "Latin America" is no country). Words match
 * whole, case and diacritics aside, so "Portland" is not Poland. After a move
 * arrow ("Berlin -> Warsaw") the place after the arrow wins. Namesakes abroad
 * without a state or country ("Warsaw, IN") land in the city's country.
 */
export function countryOf(location: string | null | undefined) {
	if (!location) return undefined
	for (const segment of location.split(MOVE_ARROW).toReversed()) {
		const code = findSegmentCountry(segment)
		if (code) return code
	}

	return undefined
}
