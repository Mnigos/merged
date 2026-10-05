# Context Format

merged keeps context docs and ubiquitous language separate.

- `UBIQUITOUS_LANGUAGE.md` is the glossary: canonical terms, aliases, ambiguity resolution, and example dialogue.
- `ARCHITECTURE.md` is the current module map: ownership, layers, dependency rules, Blob files.
- `CONTEXT.md` is an optional root domain context: scope, responsibilities, relationships, and links to ADRs/code.
- `CONTEXT-MAP.md` is the multi-context index when separate durable context docs exist.

Do not use `UBIQUITOUS_LANGUAGE.md` as a substitute for `CONTEXT.md` or `ARCHITECTURE.md`.

## Root Context Shape

```md
# Context

{One or two sentences describing what this repo/product context is and why it exists.}

## Scope

- {What this context owns}
- {What this context does not own}

## Responsibilities

- {Responsibility}

## Relationships

- **Context A -> Context B**: {relationship, data dependency, or service call}

## Language

See `UBIQUITOUS_LANGUAGE.md`.

## ADRs

- `docs/decisions/NNNN-slug.md`: {decision}
```

## Rules

- Keep context docs about ownership, scope, responsibilities, relationships, and constraints.
- Keep term definitions in `UBIQUITOUS_LANGUAGE.md`.
- Link to ADRs instead of restating full decisions.
- Link to modules and Blob paths only when they clarify ownership.
- Keep implementation details out unless they explain durable ownership or boundaries.
- Create `CONTEXT.md` lazily when repo-level context needs to be persisted beyond `ARCHITECTURE.md`.

## Current Context Strategy

The repo has a shared glossary in `UBIQUITOUS_LANGUAGE.md` and module ownership in `ARCHITECTURE.md`. Known contexts:

- Ingest
- Ranking
- Profiles
- Share

Create `CONTEXT-MAP.md` with per-context docs under `docs/contexts/` only when a context grows rules that no longer fit `ARCHITECTURE.md`, or the user asks for that split. When it exists, read it first and then only the context docs relevant to the task.
