---
name: effect-schema
description: Effect 4 Schema definitions, boundary decoding, branded types, tagged errors, and Effect services/Layers conventions for merged. Use when defining Schema for GH Archive events, Blob JSON files, GitHub API responses, server function input, or route search params, and when creating Effect services, ports, adapters, or errors.
---

Use this skill for Effect Schema and the Effect service conventions around it. Effect is pinned to `4.0.0`; APIs differ from Effect 3 (`Context.Service`, not `Context.Tag`; `Schema.Literals`, `Schema.decodeUnknownEffect`).

## First Read

Before editing, read:

- This skill and the Effect section of `AGENTS.md`.
- At least 3 similar existing Schema, service, or error files when they exist.
- The `effect` type declarations (`node_modules/effect/dist/Schema.d.ts`, `Context.d.ts`, `Layer.d.ts`) for any API you are not certain about. Do not rely on Effect 3 memory.

Prefer live repo patterns over examples in this skill.

## Schema Rules

- Decode at real untrusted boundaries only: GH Archive lines, Blob JSON, GitHub API responses, server function input, route search params. Do not re-decode typed internal data.
- Non-class schemas are camelCase with a `Schema` suffix; the inferred type is PascalCase next to it. Classes (`Schema.Class`, `Schema.TaggedError`) are PascalCase and serve as both.
- Brand identifiers that must not mix: GitHub login, season id, ISO date. Shared brands live in `src/shared/schema/`; module-only ones in the module's `domain/`.
- Prefer `Schema.optional(...)` over nullable at our own boundaries; accept `Schema.NullOr(...)` only where GitHub or GH Archive returns `null`.
- Persisted Blob files keep backward compatibility: add fields as optional, never rename a field in place; bump the file shape only with a migration plan.
- Keep each Blob file's Schema in the domain of the module that writes it; readers use that module's application service, not the Schema.
- Use `Schema.fromJsonString(schema)` with `Schema.decodeUnknownEffect` for JSON text; never `JSON.parse` then cast.
- For GH Archive, filter lines by prefix before decoding, and decode only the fields scoring needs.
- Server function input: `.validator(Schema.toStandardSchemaV1(inputSchema))`.

```ts
export const seasonIdSchema = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^\d{4}-\d{2}$/u)),
	Schema.brand('SeasonId')
)
export type SeasonId = typeof seasonIdSchema.Type

export const shardSchema = Schema.Struct({
	season: seasonIdSchema,
	entries: Schema.Array(ShardEntry),
})
export type Shard = typeof shardSchema.Type

export const decodeShardJson = Schema.decodeUnknownEffect(
	Schema.fromJsonString(shardSchema)
)
```

## Services, Ports, Layers

- A port is a `Context.Service` declared in `application/*.port.ts` with a named `*Shape` interface; adapters in `infrastructure/` export `<adapter>Layer = Layer.effect(Port, …)` or `Layer.succeed`.
- An application service declares its shape and a `static readonly layer` that yields its ports.
- Service keys are `'<module>/<Name>'`, unique across the app.
- Name traced methods with `Effect.fn('<Service>.<method>')`.
- `<module>.layer.ts` provides adapters to the module's services; composition roots merge module layers.

```ts
export class ContributorResults extends Context.Service<
	ContributorResults,
	ContributorResultsShape
>()('ranking/ContributorResults') {
	static readonly layer = Layer.effect(
		ContributorResults,
		Effect.gen(function* () {
			const store = yield* ShardStore

			const getResult = Effect.fn('ContributorResults.getResult')(function* (
				season: SeasonId,
				login: GitHubLogin
			) {
				const shard = yield* store.read(season, login.slice(0, 2))

				return shard.entries.find(entry => entry.login === login)
			})

			return { getResult }
		})
	)
}
```

## Errors

- One error class per file, `<name>.error.ts`, in the layer that owns it: `Schema.TaggedError<Self>()('<Name>Error', { …fields })`.
- Adapters translate provider failures (HTTP status, Blob not found, rate limit) into module errors; nothing above infrastructure sees provider error types.
- Recover with `Effect.catchTag`; let unexpected defects crash the script so the workflow fails loudly.
- `unicorn/throw-new-error` is off only for `*.error.ts` because `TaggedError()()` is a factory call.

## Config

- Read secrets and settings with Effect `Config` (`Config.String(…)`, `Config.Redacted(…)` for tokens) in `src/shared/config/`; never `process.env` in modules.

## Verification

- Run `bun run typecheck`.
- Run `bun run check:fix`.
- Add specs for non-trivial decoding (malformed lines, missing optional fields) next to the Schema.
