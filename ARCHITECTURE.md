# Architecture

Map of merged: what lives where, which module owns what, and how the pieces talk. Domain vocabulary lives in [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md); hard-to-reverse decisions live in [docs/decisions](docs/decisions).

merged is a modular monolith in one package ([ADR 0003](docs/decisions/0003-modular-ddd-layout-in-one-package.md)). There is no database, no auth, and no API server ([ADR 0001](docs/decisions/0001-stack-and-no-database-architecture.md)): GitHub Actions run the pipeline scripts, Vercel Blob stores JSON, and the TanStack Start app reads it through server functions ([ADR 0004](docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md)).

## Repository layout

| Path                | What it is                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `src/modules/`      | Bounded contexts, one folder per module, layered as below.                                      |
| `src/shared/`       | Cross-module kernel. Never imports from `src/modules/`.                                         |
| `src/routes/`       | Thin TanStack Start file routes. Compose pages from module `presentation/`.                     |
| `src/runtime/`      | App composition root: merges module Layers into the runtime that server functions use.          |
| `src/styles.css`    | Tailwind 4 entry and design tokens.                                                             |
| `scripts/`          | Pipeline CLI entrypoints (`ingest-day`, `enrich`, `build-ranking`). Wire Layers, call services. |
| `.github/workflows` | CI, and later the daily cron and backfill workflows.                                            |
| `docs/`             | Plan, design mockups, and [decision records](docs/decisions).                                   |

## Flows

```
Pipeline (GitHub Actions, daily 06:00 UTC)
  scripts/<command>.ts           wires module Layers
    → <module>/application        Effect services and use cases
      → <module>/domain           pure rules (scoring, aggregation)
      → <module>/infrastructure   GH Archive, GitHub GraphQL, Vercel Blob adapters

Request (Vercel)
  src/routes/<route>.tsx          params, validateSearch, loader
    → <module>/presentation/*.functions.ts   createServerFn, Schema-validated input
      → src/runtime               ManagedRuntime with module Layers
        → <module>/application    reads Blob through module ports
```

## Modules

| Module     | Owns                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest`   | GH Archive hourly files to **Daily aggregates**. Domain: merged pull request events, daily aggregate. Infrastructure: GH Archive source, daily aggregate Blob store. |
| `ranking`  | **Score**, **Season**, **Board**, **Rank**, **Percentile**, shards, season index, **Exclusion** rules. Domain holds the scoring formula (`domain/scoring.ts`).       |
| `profiles` | **Enrichment** of contributors and repositories through GitHub GraphQL: stars, language, location, avatar. Receives the candidate list as input.                     |
| `share`    | **Share card** (OG image), share text, and the README **Badge** endpoint. Reads ranking and profiles through their application services.                             |

Module dependencies are acyclic: `ingest` and `profiles` depend on no module, `ranking` reads `ingest` and `profiles`, `share` reads `ranking` and `profiles`. Scripts orchestrate across modules, for example `enrich` asks `ranking` for candidates and hands them to `profiles`.

## Module layout

```
src/modules/<module>/
  domain/            pure types, Schema, invariants, pure functions, domain errors
  application/       Effect services (use cases) and ports (services that infrastructure implements)
  infrastructure/    adapters: Blob stores, GH Archive source, GitHub client calls
  presentation/      components/, <name>.functions.ts server functions, hooks/
  testing/           in-memory port Layers and fixtures for specs only
  <module>.layer.ts  wires the module's application services to its adapters
```

Create a layer folder only when it has content (`ingest` has no presentation). When three or more files share a role inside a layer, group them in a role subdirectory (`infrastructure/stores/`, `presentation/components/`).

File names are kebab-case with a role suffix where it helps: `*.service.ts` (application service), `*.port.ts` (port), `*.error.ts` (tagged errors), `*.functions.ts` (server functions), `*.server.ts` (server-only code, kept out of the client bundle by TanStack Start import protection), `*.spec.ts(x)` (tests beside the code). Domain files are named after the concept (`scoring.ts`, `season.ts`).

## Dependency rules

Dependencies point inwards: presentation → application → domain. Infrastructure implements application ports and depends on application and domain.

| Layer            | May import                                                                              | Must not import                                                    |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `domain`         | own domain, `effect` data modules (`Schema`, `Option`, …), `@shared/schema`             | application, infrastructure, presentation, React, TanStack         |
| `application`    | own domain, `effect`, `@shared/*`, other modules' application services and domain types | own infrastructure (it gets adapters through Layers), presentation |
| `infrastructure` | own application ports and domain, `effect`, `@shared/*`                                 | presentation, other modules' internals                             |
| `presentation`   | own application and domain, `@shared/*`, other modules' application services            | infrastructure (only `<module>.layer.ts` wires it)                 |
| `src/shared`     | `effect`, external SDKs                                                                 | anything in `src/modules/`                                         |
| `src/routes`     | module `presentation/`, `@shared/ui`                                                    | application, infrastructure, `effect`                              |

- Modules talk through application services only. Importing another module's `domain/` types is allowed so service signatures can be typed; reaching into its application internals, infrastructure, or presentation is not.
- React components and hooks never import `effect`. They receive plain data from loaders or call server functions.
- No barrel files; import concrete files. Cross-module imports use `@modules/<module>/…`, kernel imports `@shared/…`, imports inside a module are relative.
- oxlint enforces the mechanical part: no barrels in `src/` and `scripts/`, no outward imports from `domain/`, no module imports from `src/shared/`, no `effect` in routes or components.

## Shared kernel

| Path                  | Holds                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/shared/schema/`  | Schema helpers and shared branded types (GitHub login, season id, ISO date).                            |
| `src/shared/storage/` | `BlobStorage` port (read and write JSON by path) and its Vercel Blob adapter.                           |
| `src/shared/github/`  | `GitHubClient` port (batched GraphQL, retry, rate limiter) and its adapter; **Bot** rules in `bots.ts`. |
| `src/shared/config/`  | Effect `Config` definitions for tokens and Blob credentials.                                            |
| `src/shared/errors/`  | Cross-module tagged errors such as storage and decode failures.                                         |
| `src/shared/ui/`      | Reusable, domain-free UI primitives.                                                                    |
| `src/shared/utils/`   | Domain-agnostic utils with JSDoc.                                                                       |

Modules build typed stores on top of `BlobStorage` in their own `infrastructure/`: each store owns its paths and decodes its files with the module's Schema.

## Ingest

`scripts/ingest-day.ts` runs `IngestDay` (`ingest/application/ingest-day.service.ts`) over the `ArchiveSource` and `DayStore` ports. Each GH Archive hour streams through gunzip and line splitting; a substring check drops lines without a `PullRequestEvent` or `WatchEvent` marker before JSON parsing, Schema decodes the rest, invalid or irrelevant lines are counted and skipped, and bots are excluded. Hours run concurrently (4 by default); the day's events become one **Daily aggregate**.

GH Archive trimmed pull request payloads in 2025: a merge is now `action: "merged"` with the author as `actor`, and the merger is absent. The decoder reads that format and the older `closed` plus `merged: true` format; for trimmed events an unknown merger counts as merged by someone else, and the aggregate keeps those pull request numbers so pass 2 can resolve the merger for candidates. Logins and repository names are lowercased; own-repo merges get only a per-author count.

## Data files in Blob

| Path                                  | Content                                                                                                                                                     | Size      | Writer     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| `days/<YYYY-MM-DD>.json`              | Day totals; rows of author, repository, merged, self-merged, merged PR numbers; own-repo counts per author; stars and external merge authors per repository | a few MB  | `ingest`   |
| `seasons/<YYYY-MM>/repos.json`        | Repository standing: contributors, stars in season, real stars, language                                                                                    | a few MB  | `profiles` |
| `seasons/<YYYY-MM>/profiles.json`     | Avatar, name, location, company for candidates                                                                                                              | a few MB  | `profiles` |
| `seasons/<YYYY-MM>/tabs/<board>.json` | Top 100 for a board: `global`, `poland`, `typescript`, `rust`, …                                                                                            | < 100 KB  | `ranking`  |
| `seasons/<YYYY-MM>/shards/<xx>.json`  | Score, rank, percentile of every contributor; 256 shards by login hash                                                                                      | 50–100 KB | `ranking`  |
| `seasons/index.json`                  | Season list, last recompute time, footer stats                                                                                                              | 1 KB      | `ranking`  |

Only the writer module decodes and encodes a file; readers go through its application service.

## Decision records

| ADR                                                                        | Decision                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [0001](docs/decisions/0001-stack-and-no-database-architecture.md)          | TanStack Start + Effect 4, no database, no API server.              |
| [0002](docs/decisions/0002-scoring-formula.md)                             | Scoring formula: merge weights, log10 popularity, 30% per-repo cap. |
| [0003](docs/decisions/0003-modular-ddd-layout-in-one-package.md)           | Modular DDD layout in one package.                                  |
| [0004](docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md) | Pipeline on GitHub Actions, storage in Vercel Blob.                 |

## Related docs

- [PRODUCT.md](PRODUCT.md): users, brand, product principles.
- [docs/plan.html](docs/plan.html): plan, scoring, pipeline, routes.
- [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md): bounded contexts and domain terms.
- [AGENTS.md](AGENTS.md) and `.agents/skills`: working rules per area.
