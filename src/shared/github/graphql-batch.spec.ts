import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { RATE_LIMIT_FIELD } from './github-graphql-rate-limit'
import {
	buildBatchQuery,
	decodeBatch,
	toBatchAlias,
	type GraphqlBatchSpec,
} from './graphql-batch'

const repositorySpec = {
	variables: { owner: 'String!', name: 'String!' },
	toVariables: (repository: string) => {
		const [owner, name] = repository.split('/')

		return { owner, name }
	},
	toField: ({ owner, name }) =>
		`repository(owner: ${owner}, name: ${name}) { stargazerCount }`,
} as const satisfies GraphqlBatchSpec<string>

const nodeSchema = Schema.Struct({ stargazerCount: Schema.Int })

describe('buildBatchQuery', () => {
	it('aliases one field per item with indexed variables and the rate limit', () => {
		const batch = buildBatchQuery(repositorySpec, ['acme/widgets', 'a/b'])

		expect(batch.document).toBe(
			'query($owner0: String!, $name0: String!, $owner1: String!, $name1: String!) { ' +
				'a0: repository(owner: $owner0, name: $name0) { stargazerCount } ' +
				'a1: repository(owner: $owner1, name: $name1) { stargazerCount } ' +
				`${RATE_LIMIT_FIELD} }`
		)
		expect(batch.variables).toEqual({
			owner0: 'acme',
			name0: 'widgets',
			owner1: 'a',
			name1: 'b',
		})
		expect([...batch.aliases]).toEqual([
			['a0', 'acme/widgets'],
			['a1', 'a/b'],
		])
	})

	it('maps 100 items to aliases a0 to a99 in order', () => {
		const items = Array.from({ length: 100 }, (_, index) => `o/r${index}`)
		const batch = buildBatchQuery(repositorySpec, items)

		expect(batch.aliases.size).toBe(100)
		expect(batch.aliases.get(toBatchAlias(99))).toBe('o/r99')
		expect(batch.variables['name99']).toBe('r99')
	})
})

describe('decodeBatch', () => {
	const batch = buildBatchQuery(repositorySpec, ['a/found', 'a/gone', 'a/odd'])

	it.effect('pairs each alias with its node, errors and the rate limit', () =>
		Effect.gen(function* () {
			expect(
				yield* decodeBatch(batch, nodeSchema, {
					data: {
						a0: { stargazerCount: 7 },
						a1: null,
						rateLimit: { cost: 1, remaining: 4990, resetAt: 'x' },
					},
					errors: [
						{ type: 'NOT_FOUND', path: ['a1'], message: 'not found' },
						{ type: 'FORBIDDEN', path: ['a2'], message: 'forbidden' },
					],
				})
			).toEqual({
				entries: [
					{ item: 'a/found', node: { stargazerCount: 7 }, errors: [] },
					{
						item: 'a/gone',
						node: null,
						errors: [{ type: 'NOT_FOUND', path: ['a1'], message: 'not found' }],
					},
					{
						item: 'a/odd',
						node: null,
						errors: [{ type: 'FORBIDDEN', path: ['a2'], message: 'forbidden' }],
					},
				],
				rateLimit: { cost: 1, remaining: 4990, resetAt: 'x' },
			})
		})
	)

	it.effect('fails when the whole query returned no data', () =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip(
					decodeBatch(batch, nodeSchema, {
						data: null,
						errors: [{ message: 'Parse error' }],
					})
				)
			).toMatchObject({ _tag: 'SchemaError' })
		})
	)

	it.effect('fails when a node does not match its schema', () =>
		Effect.gen(function* () {
			expect(
				yield* Effect.flip(
					decodeBatch(batch, nodeSchema, {
						data: { a0: { stargazerCount: 'many' } },
						errors: [],
					})
				)
			).toMatchObject({ _tag: 'SchemaError' })
		})
	)
})

describe('batch alias identity', () => {
	it.effect(
		'maps every response alias to its input regardless of response field order',
		() =>
			Effect.gen(function* () {
				const items = Array.from(
					{ length: 100 },
					(_, index) => `owner/repo-${index}`
				)
				const batch = buildBatchQuery(repositorySpec, items)
				const data = Object.fromEntries(
					items
						.map(
							(_, index) => [`a${index}`, { stargazerCount: index }] as const
						)
						.toReversed()
				)
				const decoded = yield* decodeBatch(batch, nodeSchema, {
					data,
					errors: [],
				})

				expect(decoded.entries).toEqual(
					items.map((item, index) => ({
						item,
						node: { stargazerCount: index },
						errors: [],
					}))
				)
				for (const [index, item] of items.entries()) {
					expect(batch.aliases.get(`a${index}`)).toBe(item)
					expect(batch.variables[`name${index}`]).toBe(`repo-${index}`)
				}
				expect(batch.document).toContain('rateLimit { cost remaining resetAt }')
			})
	)
})
