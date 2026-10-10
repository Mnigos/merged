import { Effect, Option, Schema } from 'effect'
import {
	graphqlRateLimitSchema,
	RATE_LIMIT_FIELD,
	type GraphqlRateLimit,
} from './github-graphql-rate-limit'
import type { GraphqlError, GraphqlResponse } from './github-graphql.port'

/** Aliased fields one batch query carries at most, so a query costs about one point. */
export const MAX_BATCH_SIZE = 100

/** How one item becomes an aliased field of a batch query. */
export interface GraphqlBatchSpec<TItem> {
	/** GraphQL type of each variable an item needs, e.g. `{ owner: 'String!', name: 'String!' }`. */
	readonly variables: Readonly<Record<string, string>>
	/** Values of those variables for one item, keyed like `variables`. */
	readonly toVariables: (item: TItem) => Readonly<Record<string, unknown>>
	/** The field for one item given its variable references, e.g. `repository(owner: $owner3, name: $name3) { … }`. */
	readonly toField: (references: Readonly<Record<string, string>>) => string
}

/** A query document with one alias per item, ready for `GitHubGraphql.query`. */
export interface GraphqlBatch<TItem> {
	readonly document: string
	readonly variables: Readonly<Record<string, unknown>>
	/** Alias to item, in item order. */
	readonly aliases: ReadonlyMap<string, TItem>
}

/** Alias of the item at `index` in a batch query: `a0`, `a1`, … */
export const toBatchAlias = (index: number) => `a${index}`

/**
 * Builds one query with an aliased field per item and `RATE_LIMIT_FIELD`.
 * Variables are suffixed with the item index (`$owner0`, `$name0`, …), so
 * values never need escaping. Chunk items to `MAX_BATCH_SIZE` first.
 */
export function buildBatchQuery<TItem>(
	spec: GraphqlBatchSpec<TItem>,
	items: readonly TItem[]
): GraphqlBatch<TItem> {
	const declarations: string[] = []
	const fields: string[] = []
	const variables: Record<string, unknown> = {}
	const aliases = new Map<string, TItem>()

	for (const [index, item] of items.entries()) {
		const alias = toBatchAlias(index)
		const values = spec.toVariables(item)
		const references: Record<string, string> = {}
		for (const [name, type] of Object.entries(spec.variables)) {
			const variable = `${name}${index}`
			declarations.push(`$${variable}: ${type}`)
			references[name] = `$${variable}`
			variables[variable] = values[name]
		}
		fields.push(`${alias}: ${spec.toField(references)}`)
		aliases.set(alias, item)
	}
	const signature =
		declarations.length > 0 ? `query(${declarations.join(', ')})` : 'query'

	return {
		document: `${signature} { ${[...fields, RATE_LIMIT_FIELD].join(' ')} }`,
		variables,
		aliases,
	}
}

/** One item of a batch with its decoded node (`null` when GitHub returned none) and its errors. */
export interface BatchEntry<TItem, TNode> {
	readonly item: TItem
	readonly node: TNode | null
	/** Errors whose path starts with this item's alias, e.g. `NOT_FOUND`. */
	readonly errors: readonly GraphqlError[]
}

export interface DecodedBatch<TItem, TNode> {
	readonly entries: readonly BatchEntry<TItem, TNode>[]
	readonly rateLimit: GraphqlRateLimit | undefined
}

const batchDataSchema = Schema.Record(Schema.String, Schema.Unknown)
const decodeBatchData = Schema.decodeUnknownEffect(batchDataSchema)
const decodeRateLimit = Schema.decodeUnknownOption(graphqlRateLimitSchema)

/**
 * Decodes each alias of a batch response with `nodeSchema` (allowing `null`)
 * and pairs it with its item and errors. Fails when `data` is not an object,
 * which GitHub returns when the whole query failed.
 */
export const decodeBatch = Effect.fn('decodeBatch')(function* <
	TItem,
	TNode,
	TEncoded,
>(
	batch: GraphqlBatch<TItem>,
	nodeSchema: Schema.Codec<TNode, TEncoded>,
	response: GraphqlResponse
) {
	const data = yield* decodeBatchData(response.data)
	const decodeNode = Schema.decodeUnknownEffect(Schema.NullOr(nodeSchema))
	const entries = yield* Effect.forEach([...batch.aliases], ([alias, item]) =>
		decodeNode(data[alias] ?? null).pipe(
			Effect.map((node): BatchEntry<TItem, TNode> => ({
				item,
				node,
				errors: response.errors.filter(error => error.path?.[0] === alias),
			}))
		)
	)

	return {
		entries,
		rateLimit: Option.getOrUndefined(decodeRateLimit(data.rateLimit)),
	} satisfies DecodedBatch<TItem, TNode>
})
