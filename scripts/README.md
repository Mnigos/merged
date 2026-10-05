# scripts

Data pipeline run by GitHub Actions (daily cron at 06:00 UTC) with Bun and Effect. Each script is a composition root: it parses arguments, merges module Layers, and calls application services in `src/modules/`. No domain logic lives here. See [ARCHITECTURE.md](../ARCHITECTURE.md) and [ADR 0004](../docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md).

| Command                          | Modules               | Does                                                                                                                                                                                 |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ingest-day --date YYYY-MM-DD`   | `ingest`              | Downloads the day's 24 GH Archive files, keeps only `PullRequestEvent` and `WatchEvent` lines before parsing, decodes and aggregates them, writes `days/<date>.json` to Vercel Blob. |
| `enrich --season YYYY-MM`        | `ranking`, `profiles` | Scoring pass 1 in `ranking` picks candidates; `profiles` fetches repository stars and profiles through batched GitHub GraphQL with retry and a rate limiter, caches results in Blob. |
| `build-ranking --season YYYY-MM` | `ranking`             | Scoring pass 2, builds boards, percentiles, shards and `seasons/index.json`. Scoring rules live in `src/modules/ranking/domain/`.                                                    |

None of these exist yet. `smoke.ts` proves Effect runs under Bun:

```sh
bun run scripts/smoke.ts
```
