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
| `.github/workflows` | CI, the daily `pipeline.yml` cron and the manual `backfill.yml`.                                |
| `docs/`             | Plan, design mockups, and [decision records](docs/decisions).                                   |

## Flows

```
Pipeline (GitHub Actions .github/workflows/pipeline.yml, cron 06:00 UTC)
  scripts/pipeline.ts --storage blob   one process, write-through cache over Blob
    ingest-day <yesterday>             skipped when the day exists
    [on the 1st: build-ranking → enrich → build-ranking for the closed season]
    build-ranking <season>             pass 1, picks candidates
    enrich <season>
    build-ranking <season>             pass 2

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

| Module     | Owns                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest`   | GH Archive hourly files to **Daily aggregates**. Domain: merged pull request events, daily aggregate. Infrastructure: GH Archive source, daily aggregate Blob store.                                                               |
| `ranking`  | **Score**, **Season**, **Board**, **Rank**, **Percentile**, shards, season index, **Exclusion** rules. Domain holds the scoring formula (`domain/scoring.ts`).                                                                     |
| `profiles` | **Enrichment** through GitHub GraphQL: real stars and language of the season's repositories, name, location, company and avatar of candidates, mergers of their pull requests. Receives the candidates as input; never picks them. |
| `share`    | **Share card** (OG image), share text, and the README **Badge** endpoint. Reads ranking and profiles through their application services.                                                                                           |

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

Create a module or layer folder only when it has content (`ingest` has no presentation; `profiles`, `share` and `src/runtime` appear with their first file). No `.gitkeep` placeholders. When three or more files share a role inside a layer, group them in a role subdirectory (`infrastructure/stores/`, `presentation/components/`).

File names are kebab-case with a role suffix where it helps: `*.service.ts` (application service), `*.port.ts` (port), `*.error.ts` (tagged errors), `*.functions.ts` (server functions), `*.server.ts` (server-only code, kept out of the client bundle by TanStack Start import protection), `*.spec.ts(x)` (tests beside the code). Domain files are named after the concept (`scoring.ts`, `season.ts`).

## Dependency rules

Dependencies point inwards: presentation → application → domain. Infrastructure implements application ports and depends on application and domain.

| Layer            | May import                                                                                                                   | Must not import                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `domain`         | own domain, `effect` data modules (`Schema`, `Option`, …), `@shared/schema`, pure shared rules such as `@shared/github/bots` | application, infrastructure, presentation, React, TanStack         |
| `application`    | own domain, `effect`, `@shared/*`, other modules' application services and domain types                                      | own infrastructure (it gets adapters through Layers), presentation |
| `infrastructure` | own application ports and domain, `effect`, `@shared/*`                                                                      | presentation, other modules' internals                             |
| `presentation`   | own application and domain, `@shared/*`, other modules' application services                                                 | infrastructure (only `<module>.layer.ts` wires it)                 |
| `src/shared`     | `effect`, external SDKs                                                                                                      | anything in `src/modules/`                                         |
| `src/routes`     | module `presentation/`, `@shared/ui`                                                                                         | application, infrastructure, `effect`                              |

- Modules talk through application services only. Importing another module's `domain/` types is allowed so service signatures can be typed; reaching into its application internals, infrastructure, or presentation is not.
- React components and hooks never import `effect`. They receive plain data from loaders or call server functions.
- No barrel files; import concrete files. Cross-module imports use `@modules/<module>/…`, kernel imports `@shared/…`, imports inside a module are relative.
- oxlint enforces the mechanical part: no barrels in `src/` and `scripts/`, no outward imports from `domain/`, no module imports from `src/shared/`, no `effect` in routes or components.

## Shared kernel

| Path                  | Holds                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/schema/`  | Schema helpers and shared branded types (GitHub login, season id, ISO date, ISO date-time).                                                                                                                                                   |
| `src/shared/storage/` | `JsonStorage` port (read and write text by POSIX-relative path), local-disk adapter, in-memory test adapter, write-through cache decorator, Vercel Blob adapter (public JSON under `BLOB_BASE_URL`, `cacheControlMaxAge` 60 s, reads by URL). |
| `src/shared/github/`  | `GitHubGraphql` port (one query at a time, retry with backoff, rate limit waits) and its HTTP adapter, aliased batch queries in `graphql-batch.ts`, in-memory test layer; **Bot** rules in `bots.ts`.                                         |
| `src/shared/config/`  | Effect `Config` definitions for tokens (`GITHUB_TOKEN`) and Blob credentials (`BLOB_READ_WRITE_TOKEN`, `BLOB_BASE_URL`).                                                                                                                      |
| `src/shared/errors/`  | Cross-module tagged errors such as storage and decode failures.                                                                                                                                                                               |
| `src/shared/ui/`      | Reusable, domain-free UI primitives.                                                                                                                                                                                                          |
| `src/shared/utils/`   | Domain-agnostic utils with JSDoc.                                                                                                                                                                                                             |

Modules build typed stores on top of `JsonStorage` in their own `infrastructure/`: each store owns its paths and decodes its files with the module's Schema (`ingest` `json-day-store.ts`, `ranking` `json-season-store.ts`, `profiles` `json-profile-store.ts`).

## Ingest

`scripts/ingest-day.ts` runs `IngestDay` (`ingest/application/ingest-day.service.ts`) over the `ArchiveSource` and `DayStore` ports. Each GH Archive hour streams through gunzip and line splitting; a substring check drops lines without a `PullRequestEvent` or `WatchEvent` marker before JSON parsing, Schema decodes the rest, invalid or irrelevant lines are counted and skipped, and bots are excluded. Hours run concurrently (4 by default); the day's events become one **Daily aggregate**.

GH Archive trimmed pull request payloads in 2025: a merge is now `action: "merged"` with the author as `actor`, and the merger is absent. The decoder reads that format and the older `closed` plus `merged: true` format; for trimmed events an unknown merger counts as merged by someone else, and the aggregate keeps those pull request numbers so pass 2 can resolve the merger for candidates. Logins and repository names are lowercased; own-repo merges get only a per-author count.

## Ranking

`scripts/build-ranking.ts` runs `BuildSeason` (`ranking/application/build-season.service.ts`) over ingest's `DailyAggregates` application service, the `EnrichmentSource` port, and the `SeasonStore` port; ranking reads days only through `DailyAggregates`, never through ingest's `DayStore` port. It reads every day of the season (missing days are skipped and recorded), sums them into a **Season** (each pull request once, bots and excluded repositories kept out of standing), scores it with `domain/scoring.ts`, and writes candidates, all 256 shards, boards, then `seasons/index.json` last, so a failure mid-run leaves boards and index on the previous build as far as possible. Builds run sequentially, one season at a time; a failed build is repaired by rerunning it. `EnrichmentSource` is `profilesEnrichmentSourceLayer`, which reads profiles' `SeasonProfiles`: before `enrich` ran for the season it returns empty enrichment (scoring pass 1, archive proxies only); afterwards real stars set repository standing and whether a repository counts, known mergers turn merged pull requests into self-merged, and locations fill the Poland board (scoring pass 2). Logins flagged as bots by enrichment are kept out of the season like `isBot` matches. `Candidates` (`ranking/application/candidates.service.ts`) is the read side of `candidates.json` for the `enrich` script.

## Profiles

`scripts/enrich.ts` reads the season's candidates through ranking's `Candidates` and hands them to `Enrich` (`profiles/application/enrich.service.ts`), so the module graph stays acyclic. `Enrich` runs over the `ProfileSource` port (`infrastructure/github-profile-source.ts` on the shared `GitHubGraphql`) and the `ProfileStore` port. For each kind (repositories, contributors, pull requests) it keeps fresh entries of the existing file (7 days; a known merger is never refetched), fetches the rest in queries of 100 aliases, one at a time, writes the file every 10 batches and at the end, and reports requested, cached, fetched, missing and failed counts with query cost. Not found (deleted, renamed, private, or an app account, since GraphQL `user` cannot see bots) is recorded as `missing`; any other error under an alias, nested ones included, leaves that item for the next run. The GraphQL adapter retries 5xx, network errors and rate limits with backoff, waits for `retry-after`, `x-ratelimit-reset` or 60 s (a 429, or a 403 about the secondary rate limit; a permission 403 is not retried), pauses until `resetAt` when fewer than 100 points remain, and keeps the token out of error messages. Other modules read the files through `SeasonProfiles`.

Every `build-ranking` regenerates `candidates.json` from its own scoring, so contributors who become counted only in pass 2 have no profile or merger yet. The daily run is therefore `build-ranking → enrich → build-ranking`: pass 1 picks candidates, `enrich` fetches what is missing or stale (cached entries cost nothing), pass 2 scores with it; newcomers of pass 2 are enriched by the next day's run. On the first of a month `pipeline.ts` runs the chain once more for the season that just closed, so its last newcomers are enriched in the same run before the final build. The steps run in one process over `writeThroughJsonStorageLayer` because Blob's CDN can serve the previous version of an overwritten file for up to a minute.

## Data files in Blob

Every file is public JSON at `<BLOB_BASE_URL>/<path>` (for example `https://xxxx.public.blob.vercel-storage.com/seasons/index.json`), written in place without a random suffix and with `cacheControlMaxAge` 60 s, so the website sees a recompute within a minute. The pipeline writes with `BLOB_READ_WRITE_TOKEN`, read only at the first write; reads fetch the public URL with `cache-control: no-cache`, so the website needs only `BLOB_BASE_URL`. That header does not guarantee read-after-write: chained pipeline steps rely on the write-through cache of their single process. Pipeline scripts pick the store with `--storage local|blob`; paths are the same on local disk under `data/`.

| Path                                  | Content                                                                                                                                                                                                         | Size       | Writer     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| `days/<YYYY-MM-DD>.json`              | Day totals; rows of author, repository, merged, self-merged, merged PR numbers; own-repo counts per author; stars and external merge authors per repository                                                     | a few MB   | `ingest`   |
| `seasons/<YYYY-MM>/repos.json`        | Real stars and language of every repository of the season, keyed by `owner/name`, with fetch time and a `missing` flag                                                                                          | a few MB   | `profiles` |
| `seasons/<YYYY-MM>/profiles.json`     | Name, location, company and avatar of candidate contributors, keyed by login, with fetch time and a `missing` flag                                                                                              | about 1 MB | `profiles` |
| `seasons/<YYYY-MM>/mergers.json`      | Merger login (or `null` when unknown) of the candidates' merged pull requests, keyed by `owner/name#number`                                                                                                     | about 1 MB | `profiles` |
| `seasons/<YYYY-MM>/candidates.json`   | Pass 1 candidates for enrichment: top contributors, their repositories, their merged pull request numbers                                                                                                       | a few MB   | `ranking`  |
| `seasons/<YYYY-MM>/tabs/<board>.json` | Top 100 for a board: `global`, `poland` (contributors, with board rank, season percentile, top 3 repositories) and `repositories`; language boards later                                                        | < 100 KB   | `ranking`  |
| `seasons/<YYYY-MM>/shards/<xx>.json`  | Rank, percentile, score, Poland rank and per-repository breakdown (with `counted`) of every contributor; bots and contributors without a counted repository kept as excluded; 256 shards by FNV-1a of the login | 50–100 KB  | `ranking`  |
| `seasons/index.json`                  | Seasons newest first: status, days included and missing, recompute time, footer stats                                                                                                                           | 1 KB       | `ranking`  |

Only the writer module decodes and encodes a file; readers go through its application service.

## Decision records

| ADR                                                                        | Decision                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](docs/decisions/0001-stack-and-no-database-architecture.md)          | TanStack Start + Effect 4, no database, no API server.                                                                                        |
| [0002](docs/decisions/0002-scoring-formula.md)                             | Scoring formula: merge weights, log10 popularity, diminishing returns per organisation (amended 2026-10-10, replaced the 30% cap), bot rules. |
| [0003](docs/decisions/0003-modular-ddd-layout-in-one-package.md)           | Modular DDD layout in one package.                                                                                                            |
| [0004](docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md) | Pipeline on GitHub Actions, storage in Vercel Blob.                                                                                           |

## Related docs

- [PRODUCT.md](PRODUCT.md): users, brand, product principles.
- [docs/plan.html](docs/plan.html): plan, scoring, pipeline, routes.
- [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md): bounded contexts and domain terms.
- [AGENTS.md](AGENTS.md) and `.agents/skills`: working rules per area.
