# merged Agent Rules

## Security

- Never read `.env` files or files containing secrets or credentials.

## Communication

- Be extremely concise when reporting information.
- Sacrifice grammar for concision when useful.

## Before Editing

- Before creating or editing any file, read matching skill(s), at least 3 similar files when they exist, and uncertain imported dependency implementations or types.
- Live repo patterns beat examples and assumptions.
- Similar-file review never replaces skill usage.

## Skill Usage

- If a task matches an available skill, read that skill before research, planning, creating, or editing files.
- Use domain skills for detailed patterns:
  - `effect-schema`
  - `web-app-patterns`
  - `ui-components`
  - `testing-patterns`
  - `utils-helpers`
  - `domain-model`, `ubiquitous-language`, `adr-authoring`
  - `impeccable` for UI/design craft

## Product And Design

- Architecture map and module rules live in `ARCHITECTURE.md`.
- Domain vocabulary lives in `UBIQUITOUS_LANGUAGE.md`; decisions in `docs/decisions/`.
- Product strategy lives in `PRODUCT.md`. The plan and approved mockup live in `docs/`.
- For UI design, redesign, polish, audit, or craft, use `impeccable`.

## Stack And Commands

Bun, TanStack Start (React 19, Vite, Nitro `vercel` preset), Effect 4, Tailwind 4, TypeScript 7, Vitest 5 with `@effect/vitest`, oxlint + oxfmt through Ultracite. No database, no auth, no API server.

| Task                  | Command             |
| --------------------- | ------------------- |
| Lint and format check | `bun run check`     |
| Lint and format fix   | `bun run check:fix` |
| Typecheck             | `bun run typecheck` |
| Unit tests            | `bun run test`      |
| Build                 | `bun run build`     |
| Pipeline script       | `bun run scripts/…` |

- Use `bun run test`, not `bun test`; `bun test` invokes Bun's own runner.
- Do not run `bun run dev`; assume the dev server is running.

## Module Structure

Full rules in `ARCHITECTURE.md`. Summary:

- Bounded contexts live in `src/modules/<module>/` (`ingest`, `ranking`, `profiles`, `share`); the cross-module kernel lives in `src/shared/`.
- Layers inside a module: `domain/` (pure types, Schema, invariants, pure functions), `application/` (Effect services, use cases, ports), `infrastructure/` (adapters implementing ports), `presentation/` (components, server functions). Create a layer folder only when it has content.
- Dependencies point inwards: presentation → application → domain; infrastructure implements application ports.
- Modules talk through application services only. Another module's `domain/` types may be imported as shapes; its application internals, infrastructure, and presentation may not.
- `src/shared/` never imports from `src/modules/`.
- Routes in `src/routes/` stay thin: params, `validateSearch`, loader wiring, and page composition from `presentation/`.
- `scripts/` entrypoints only wire Layers and call application services.
- When three or more files share a role inside a layer, group them in a role subdirectory, e.g. `infrastructure/stores/`, `presentation/components/`.
- Do not create barrel (`index.ts`) files; import concrete files. The `oxc/no-barrel-file` rule enforces it.
- Imports: relative inside a module; `@modules/<module>/…` across modules; `@shared/…` for the kernel; `@/…` for other `src/` files.

## Effect

- Effect runs the pipeline, application services, adapters, and server function handlers. Domain code is plain TypeScript plus Effect data modules (`Schema`, `Option`, `Array`, `Order`); no services, Layers, or IO.
- Define services with `Context.Service<Self, Shape>()('<module>/<Name>')`. Application services expose `static readonly layer`; adapters export a `<adapter>Layer` constant from `infrastructure/`.
- Every module wires its own Layers in `<module>.layer.ts` at the module root. Composition roots (`src/runtime/` for the app, each script for the pipeline) merge module layers.
- Name traced methods with `Effect.fn('<Service>.<method>')`.
- Errors are `Schema.TaggedError` classes in `*.error.ts` files of the layer that owns them. Never `throw` inside Effect code; adapters translate provider errors into module errors; recover with `Effect.catchTag`.
- Decode with Schema at every untrusted boundary: GH Archive lines, Blob JSON, GitHub API responses, server function input, route search params. Read environment through Effect `Config`. Do not re-decode typed internal data.
- No Effect inside React components or hooks. Components receive plain data from loaders or call server functions; server function handlers run application services through the app runtime.
- Server functions live in `presentation/<name>.functions.ts`; server-only files use the `.server.ts` suffix so TanStack Start import protection keeps them out of the client bundle.

## Code Style

- Formatting is oxfmt's: tabs, no semicolons, single quotes, `arrowParens: avoid`. Run `bun run check:fix` instead of formatting by hand.
- Implementation files stay under 400 lines; split by role (component, constants, helpers) before they grow past that. Spec files have no length limit.
- Prefer `function` declarations for extracted block-body functions. Use arrows for callbacks, concise expression helpers, and components (arrow components are allowed).
- Keep params/props interfaces directly above their use; components take `Readonly<ComponentNameProps>`.
- Use kebab-case file names.
- Use descriptive names; avoid cryptic single-letter callback variables.
- Every module-level constant object literal is declared with `as const satisfies <Type>`; never a plain type annotation that widens literals, never a bare `as const` when the shape must match a type.
- Config/lookup maps of literal values use `UPPER_SNAKE_CASE` for the binding and its keys. Keys that are domain values used for indexing (`PR_WEIGHT[mergeKind]`) keep domain spelling.
- Prefix generic type parameters with `T`.
- Use interfaces for object shapes; type aliases for unions, primitives, and computed types.
- Never inline object param types in function signatures; declare a named interface directly above the use.
- Avoid redundant return types; keep explicit types for public surfaces such as service shapes.
- Prefer `undefined` over `null`; use `null` only where an external contract requires it.
- Use `??` for nullish checks and `||` for all-falsy checks.
- Use early returns. Skip braces for single-statement blocks.
- Do not use non-null assertions.
- Do not add trivial one-use pass-through helpers or defensive helpers for already-typed internal data.
- Use `to*` names only for transformations; use `get*` for message or label selection.
- Utils (`src/shared/utils/`) are global and domain-agnostic; helpers are module-specific and domain-aware. Both have JSDoc.
- Do not add comments unless explicitly asked; JSDoc on exported domain constants and helpers is fine.
- Use `size-*` instead of paired height/width utilities; prefer Tailwind scale units over arbitrary values.

## Testing

- Specs are `*.spec.ts(x)` next to the code they test; run them with `bun run test`.
- Import `describe`, `expect`, and `it` from `@effect/vitest`; there are no Vitest globals.
- Use `it.effect` for effectful code and `it.layer` or `Effect.provide` with in-memory port Layers instead of hitting Blob, GH Archive, or GitHub.
- Domain functions get plain unit specs; every scoring rule change gets a regression case.
- Details in `testing-patterns`.

## Quality

- Run before finishing: `bun run typecheck`, `bun run check:fix`, `bun run test`, and `bun run build` when routes or config change.
- Visible UI changes require desktop and mobile screenshots before completion; see `pull-request`.

## Git And GitHub

- Commit, push, or open PRs only when asked. Never merge.
- Branch names are plain and descriptive (`ranking-shards`); no agent prefixes such as `claude/` or `codex/`.
- Commit messages follow Conventional Commits; commitlint enforces them in the `commit-msg` hook, and the `pre-commit` hook runs `ultracite fix` on staged files. See `conventional-commit`.
- Never add AI or Claude attribution to commits, PRs, code, comments, or docs: no `Co-Authored-By` lines, no "Generated with" footers.
- Never create GitHub comments, discussions, or labels unless asked.
