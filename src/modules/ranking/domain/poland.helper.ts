/** Country names and codes that place a free-text location in Poland, normalized. */
export const POLAND_NAMES = [
	'poland',
	'polska',
	'pl',
	'rzeczpospolita polska',
] as const satisfies readonly string[]

/** Major Polish cities, normalized (lowercase, without diacritics), with English exonyms. */
export const POLISH_CITIES = [
	'warszawa',
	'warsaw',
	'krakow',
	'cracow',
	'wroclaw',
	'poznan',
	'gdansk',
	'gdynia',
	'sopot',
	'trojmiasto',
	'lodz',
	'katowice',
	'szczecin',
	'lublin',
	'bydgoszcz',
	'bialystok',
	'torun',
	'rzeszow',
	'olsztyn',
	'kielce',
	'opole',
	'gliwice',
	'zielona gora',
] as const satisfies readonly string[]

const POLAND_FLAG = '\u{1F1F5}\u{1F1F1}'
const COMBINING_MARKS = /\p{M}/gu
const NON_WORD = /[^\p{L}\p{N}]+/u
const PHRASES = [...POLAND_NAMES, ...POLISH_CITIES].map(phrase => ` ${phrase} `)

/** Lowercase, without diacritics (ł has no decomposition, so it is mapped), words joined by single spaces. */
const toNormalizedWords = (location: string) =>
	` ${location
		.toLowerCase()
		.replaceAll('ł', 'l')
		.normalize('NFD')
		.replace(COMBINING_MARKS, '')
		.split(NON_WORD)
		.filter(Boolean)
		.join(' ')} `

/**
 * Heuristic for the Poland board over a free-text GitHub location: true when it
 * names Poland (Poland, Polska, PL as a whole word, the 🇵🇱 flag) or a major
 * Polish city, with or without diacritics. Matches whole words only, so
 * "Portland", "Plymouth" and "Polanco" do not match. Known false positives are
 * namesakes abroad such as "Warsaw, Indiana".
 */
export function isPolandLocation(location: string | null | undefined) {
	if (!location) return false
	if (location.includes(POLAND_FLAG)) return true

	const words = toNormalizedWords(location)

	return PHRASES.some(phrase => words.includes(phrase))
}
