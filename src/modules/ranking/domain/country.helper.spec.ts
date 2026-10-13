import { describe, expect, it } from '@effect/vitest'
import { CITIES } from './cities.model'
import { COUNTRIES, findCountry, toFlag } from './countries.model'
import { countryOf, LOCATION_PHRASES, toLocationWords } from './country.helper'

describe('countryOf', () => {
	it.each([
		['Poland', 'pl'],
		['POLAND', 'pl'],
		['Polska', 'pl'],
		['Warsaw, PL', 'pl'],
		['pl', 'pl'],
		['Warszawa', 'pl'],
		['Kraków, Poland', 'pl'],
		['Krakow', 'pl'],
		['Cracow', 'pl'],
		['Wrocław', 'pl'],
		['Wroclaw', 'pl'],
		['Poznań', 'pl'],
		['Poznan, Greater Poland', 'pl'],
		['Gdańsk', 'pl'],
		['Gdansk', 'pl'],
		['Gdynia', 'pl'],
		['Łódź', 'pl'],
		['Lodz', 'pl'],
		['ŁÓDŹ', 'pl'],
		['Katowice / Remote', 'pl'],
		['Szczecin', 'pl'],
		['Lublin', 'pl'],
		['Bydgoszcz', 'pl'],
		['Białystok', 'pl'],
		['Bialystok', 'pl'],
		['Toruń', 'pl'],
		['Torun', 'pl'],
		['Rzeszów', 'pl'],
		['Rzeszow', 'pl'],
		['Olsztyn', 'pl'],
		['Kielce', 'pl'],
		['Opole', 'pl'],
		['Gliwice', 'pl'],
		['Zielona Góra', 'pl'],
		['zielona gora', 'pl'],
		['Remote (EU) 🇵🇱', 'pl'],
		['Berlin -> Warsaw', 'pl'],
		['Варшава', 'pl'],
	])('places %j in Poland', (location, code) => {
		expect(countryOf(location)).toBe(code)
	})

	it.each([
		['Germany', 'de'],
		['Deutschland', 'de'],
		['München', 'de'],
		['Muenchen, Bayern', 'de'],
		['Berlin, DE', 'de'],
		['San Francisco, CA', 'us'],
		['Mountain View, CA', 'us'],
		['NYC', 'us'],
		['Seattle, WA, USA', 'us'],
		['Paris, Texas', 'us'],
		['Venice, CA', 'us'],
		['Alexandria, VA', 'us'],
		['Warsaw, Indiana', 'us'],
		['Atlanta, Georgia', 'us'],
		['New Mexico', 'us'],
		['Toronto, CA', 'ca'],
		['London, Ontario', 'ca'],
		['Montréal, Québec', 'ca'],
		['Medellín, CO', 'co'],
		['Sydney, NSW', 'au'],
		['New South Wales', 'au'],
		['London, UK', 'gb'],
		['Edinburgh, Scotland', 'gb'],
		['🏴󠁧󠁢󠁷󠁬󠁳󠁿 Cardiff', 'gb'],
		['Belfast, Northern Ireland', 'gb'],
		['Dublin', 'ie'],
		['Paris', 'fr'],
		['Zürich', 'ch'],
		['Zuerich', 'ch'],
		['Genève, Suisse', 'ch'],
		['Praha, Česko', 'cz'],
		['København', 'dk'],
		['España', 'es'],
		['São Paulo', 'br'],
		['Sao Paulo, Brasil', 'br'],
		['Ciudad de México', 'mx'],
		['New Delhi', 'in'],
		['Bengaluru, Karnataka', 'in'],
		['भारत', 'in'],
		['Hyderabad, Pakistan', 'pk'],
		['東京都渋谷区', 'jp'],
		['日本', 'jp'],
		['中国 北京', 'cn'],
		['杭州', 'cn'],
		['서울특별시', 'kr'],
		['台北市', 'tw'],
		['Hong Kong', 'hk'],
		['Москва', 'ru'],
		['Київ, Україна', 'ua'],
		['İstanbul', 'tr'],
		['Hà Nội, Việt Nam', 'vn'],
		['ประเทศไทย', 'th'],
		['Tel Aviv-Yafo', 'il'],
		['Guinea-Bissau', 'gw'],
		['Papua New Guinea', 'pg'],
		['DR Congo', 'cd'],
		['Berlin, Germany / Warsaw, Poland', 'de'],
		['🇺🇸 → 🇩🇪', 'de'],
		['Warsaw, IN', 'pl'],
	])('places %j in %s', (location, code) => {
		expect(countryOf(location)).toBe(code)
	})

	it.each([
		'Portland',
		'Portland, OR',
		'Plymouth',
		'Polanco, Mexico City',
		'Berlin',
		'Dublin',
		'Paris, Texas',
	])('does not place %j in Poland', location => {
		expect(countryOf(location)).not.toBe('pl')
	})

	it.each([
		'Polandia',
		'Apple Park',
		'PLC',
		'Zielona',
		'Gora',
		'',
		'Earth',
		'Remote',
		'Latin America',
		'Europe',
		'localhost',
		'Plymouth',
		'Software engineer in the cloud',
		'🇪🇺',
	])('names no country in %j', location => {
		expect(countryOf(location)).toBeUndefined()
	})

	it('treats a missing location as no country', () => {
		expect(countryOf(null)).toBeUndefined()
		expect(countryOf(undefined)).toBeUndefined()
	})
})

describe('toLocationWords', () => {
	it('lowercases, strips diacritics and maps letters without a decomposition', () => {
		expect(toLocationWords('Łódź, Kraków · København / Straße')).toEqual([
			'lodz',
			'krakow',
			'kobenhavn',
			'strasse',
		])
	})
})

describe('country data', () => {
	it('lists every country once, by a lowercase two-letter code', () => {
		const codes = COUNTRIES.map(country => country.code)

		expect(new Set(codes).size).toBe(codes.length)
		expect(codes.every(code => /^[a-z]{2}$/u.test(code))).toBe(true)
		expect(codes.length).toBeGreaterThanOrEqual(249)
	})

	it('keys cities by countries in the list', () => {
		for (const code of Object.keys(CITIES))
			expect(findCountry(code)?.code).toBe(code)
	})

	it('never maps one phrase to two countries', () => {
		const codesByPhrase = Map.groupBy(LOCATION_PHRASES, phrase => phrase.text)
		const conflicts = [...codesByPhrase].filter(
			([, phrases]) =>
				new Set(phrases.map(phrase => phrase.target?.code)).size > 1
		)

		expect(conflicts.map(([text]) => text)).toEqual([])
	})

	it('draws the flag from the code', () => {
		expect(toFlag('pl')).toBe('🇵🇱')
		expect(toFlag('GB')).toBe('🇬🇧')
	})
})
