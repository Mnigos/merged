---
name: testing-patterns
description: merged testing conventions for Vitest 5 with @effect/vitest: pure domain specs, effectful service specs with in-memory port Layers, Schema decoding specs, and component specs. Use when creating, modifying, fixing, or reviewing tests.
---

Use this skill when creating, modifying, fixing, or reviewing unit or integration specs.

## First Read

Before editing, read:

- This skill.
- At least 3 existing specs matching the target test type when they exist.
- Any imported dependency, test Layer, or external module API whose usage you are not already certain about.

Prefer live specs over examples in this skill.

## Core Rules

- Specs are `*.spec.ts(x)` next to the code they test. Run `bun run test`, or `bunx vitest run <path>` for one file. Never `bun test`.
- There are no Vitest globals. Import `describe`, `expect`, and `it` from `@effect/vitest`.
- Use `it` (not `test`) so plain and effectful cases read the same: `it(...)`, `it.effect(...)`, `it.layer(...)`.
- Pure domain functions (scoring, aggregation, exclusions) get plain `it` specs with literal inputs. Every scoring rule change adds a regression case.
- Effectful code uses `it.effect` with `Effect.gen`. Provide dependencies with `it.layer(layer)(layerIt => …)` or `Effect.provide`.
- Never hit GH Archive, GitHub, or Vercel Blob in unit specs. Replace ports with `Layer.succeed(Port, { … })` test Layers defined in the spec, or in a shared `*.mock.ts` once three specs need the same one.
- Build branded test values with the schema's `make` (`seasonIdSchema.make('2026-10')`), not casts.
- Schema specs cover the boundary behavior that matters: malformed input fails, optional fields default as documented, extra fields in persisted Blob JSON are tolerated.
- Assert failures with `Effect.flip` or `Effect.exit` and check the tagged error, not the message string.
- Do not assign a generic `const result` solely to assert it once; inline the expression. Keep a named value when it is reused or the name clarifies the test.
- Do not use `.resolves` for successful async assertions. Use `expect(await promise)`; `.rejects` is allowed for expected async errors.
- Use `toBeTruthy()` for truthiness; reserve `toBe(true)` for contracts that return a literal boolean.
- When asserting behavior derived from exported constants (`PR_WEIGHT`, `CAP_PER_REPO`), import the constant instead of duplicating values.
- When moving production files between layers or modules, move matching specs in the same change.
- Spy names are the method plus `Spy`; set spies before calling the code under test.

```ts
describe('ContributorResults', () => {
	it.layer(ContributorResults.layer.pipe(Layer.provide(testShardStoreLayer)))(
		layerIt => {
			layerIt.effect('finds a contributor in their shard', () =>
				Effect.gen(function* () {
					const results = yield* ContributorResults

					expect(yield* results.getResult(season, login)).toMatchObject({
						rank: 3,
					})
				})
			)
		}
	)
})
```

## Verification

- Run targeted `bunx vitest run <path>` for changed specs, then `bun run test`.
- Run `bun run typecheck`.
