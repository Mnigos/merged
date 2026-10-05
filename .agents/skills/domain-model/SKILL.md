---
name: domain-model
description: Stress-tests plans and architecture against merged's bounded contexts (ingest, ranking, profiles, share), UBIQUITOUS_LANGUAGE.md, ADRs, and code reality. Use when applying DDD, deciding module or layer ownership, introducing Effect services or ports, naming domain concepts, or when a plan needs to be checked against the domain model.
---

# Domain Model

Use this skill to sharpen architecture and language before implementation.

## Sources

Read the relevant sources for the topic:

- `ARCHITECTURE.md` (modules, layers, dependency rules, Blob files)
- `UBIQUITOUS_LANGUAGE.md`
- `CONTEXT.md` when it exists
- `docs/decisions/*.md`
- `PRODUCT.md` and `docs/plan.html` when product behavior matters
- The GitHub issue and its discussion when one exists
- Existing module code and at least 3 similar files before proposing folder or boundary changes

Use [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) for context docs. Use `UBIQUITOUS_LANGUAGE.md` only for ubiquitous language.

## Flow

1. Identify the affected modules and their ownership.
2. Check `ARCHITECTURE.md`, the glossary, and ADRs for existing ownership, terms, and decisions.
3. Compare the user's plan with current code behavior.
4. Call out conflicts between language, ADRs, issues, and code.
5. When the user asks to brainstorm, push back, or establish a pattern, stay analysis-only until they explicitly say to proceed.
6. Ask one sharp question at a time only when code/docs cannot answer it.
7. Propose canonical terms for vague or overloaded language.
8. Update `UBIQUITOUS_LANGUAGE.md` only when the task includes glossary updates or the user asks to persist language.
9. Update `CONTEXT.md` or context docs using [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) only when the task includes context docs or the user asks to persist context.
10. Recommend `adr-authoring` using [ADR-FORMAT.md](./ADR-FORMAT.md) only when the decision is hard to reverse, surprising without context, and based on a real trade-off.

## merged Boundaries

- `domain/`: types, Schema, invariants, pure functions (scoring, aggregation, exclusions), domain errors. Plain TypeScript plus Effect data modules; no services, Layers, IO, React, or TanStack.
- `application/`: Effect services that run use cases, and ports (services the module needs from the outside world). Orchestration, policy application, cross-module calls.
- `infrastructure/`: adapters that implement ports: GH Archive streaming, GitHub GraphQL calls, typed Blob stores built on `@shared/storage`. Provider parsing and error translation live here.
- `presentation/`: React components, `*.functions.ts` server functions, hooks. Components stay free of Effect.
- `<module>.layer.ts`: the only place that wires a module's application services to its adapters.
- Keep GH Archive parsing, Blob path handling, and GitHub response mapping out of `domain/`.
- Modules talk through application services. Importing another module's `domain/` types is allowed; its application internals, infrastructure, and presentation are not.
- `src/shared/` is a kernel for genuinely cross-module pieces (Schema helpers, `BlobStorage`, `GitHubClient`, config, errors, UI primitives, utils); it never imports modules. Do not move module logic there to dodge a boundary.
- Within a layer, create a role subdirectory when three or more files share a role, such as `infrastructure/stores/` or `presentation/components/`.
- Do not add `index.ts` barrel files; import concrete files.

## Rules

- Keep ubiquitous language and context docs separate.
- Do not create `CONTEXT-MAP.md` until durable per-context docs exist or the user asks.
- Use current repo architecture over generic DDD examples.
- Treat Ingest, Ranking, Profiles, and Share as distinct contexts unless the code proves otherwise. Keep the module dependency graph acyclic as documented in `ARCHITECTURE.md`.
- Flag "user", "contribution", "tab", "popularity", "live", and "domain" when they are used ambiguously.
- Do not create ADRs, issues, commits, or comments unless the user asks.
