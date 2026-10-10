import { describe, expect, it } from '@effect/vitest'
import { isPolandLocation } from './poland'

describe('isPolandLocation', () => {
	it.each([
		'Poland',
		'POLAND',
		'Polska',
		'Warsaw, PL',
		'pl',
		'Warszawa',
		'Kraków, Poland',
		'Krakow',
		'Cracow',
		'Wrocław',
		'Wroclaw',
		'Poznań',
		'Poznan, Greater Poland',
		'Gdańsk',
		'Gdansk',
		'Gdynia',
		'Łódź',
		'Lodz',
		'ŁÓDŹ',
		'Katowice / Remote',
		'Szczecin',
		'Lublin',
		'Bydgoszcz',
		'Białystok',
		'Bialystok',
		'Toruń',
		'Torun',
		'Rzeszów',
		'Rzeszow',
		'Olsztyn',
		'Kielce',
		'Opole',
		'Gliwice',
		'Zielona Góra',
		'zielona gora',
		'Remote (EU) 🇵🇱',
		'Berlin -> Warsaw',
	])('places %j in Poland', location => {
		expect(isPolandLocation(location)).toBe(true)
	})

	it.each([
		'Portland',
		'Portland, OR',
		'Plymouth',
		'Polanco, Mexico City',
		'Polandia',
		'Dublin',
		'Berlin',
		'Apple Park',
		'PLC',
		'Zielona',
		'Gora',
		'',
		'Earth',
	])('does not place %j in Poland', location => {
		expect(isPolandLocation(location)).toBe(false)
	})

	it('treats a missing location as not in Poland', () => {
		expect(isPolandLocation(null)).toBe(false)
		expect(isPolandLocation(undefined)).toBe(false)
	})
})
