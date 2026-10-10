# scripts

Data pipeline run by GitHub Actions (daily cron at 06:00 UTC) with Bun and Effect. Each script is a composition root: it parses arguments, merges module Layers, and calls application services in `src/modules/`. No domain logic lives here. See [ARCHITECTURE.md](../ARCHITECTURE.md) and [ADR 0004](../docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md).

| Command                          | Modules               | Does                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest-day --date YYYY-MM-DD`   | `ingest`              | Streams the day's 24 GH Archive files, keeps only `PullRequestEvent` and `WatchEvent` lines before parsing, decodes and aggregates them, writes `days/<date>.json` (local disk for now, Vercel Blob later).                              |
| `enrich --season YYYY-MM`        | `ranking`, `profiles` | Reads the candidates `build-ranking` picked in scoring pass 1; `profiles` fetches real stars, contributor profiles and pull request mergers through batched GitHub GraphQL with retry and rate limit waits, caches them in season files. |
| `build-ranking --season YYYY-MM` | `ranking`             | Sums the season's daily aggregates, scores them (pass 1 now, pass 2 once enrichment exists), writes candidates, boards, percentiles, shards and `seasons/index.json`. Scoring rules live in `src/modules/ranking/domain/`.               |

The daily order is `ingest-day`, `build-ranking` (pass 1 picks candidates), `enrich`, `build-ranking` again (pass 2). `smoke.ts` proves Effect runs under Bun:

```sh
bun run scripts/smoke.ts
```

## ingest-day

```sh
bun run scripts/ingest-day.ts --date 2026-10-03                 # all 24 hours
bun run scripts/ingest-day.ts --date 2026-10-03 --hours 15      # one hour
bun run scripts/ingest-day.ts --date 2026-10-03 --hours 0-5 --concurrency 2 --out data
```

| Flag            | Default | Meaning                                                      |
| --------------- | ------- | ------------------------------------------------------------ |
| `--date`        | none    | UTC day, `YYYY-MM-DD`. Required.                             |
| `--hours`       | `0-23`  | Range `a-b` or comma list `1,5,9`.                           |
| `--concurrency` | `4`     | GH Archive hours streamed at the same time.                  |
| `--out`         | `data`  | Output root; the aggregate goes to `<out>/days/<date>.json`. |

It prints per-hour and day metrics (bytes, lines, pre-filtered lines, decoded events, merges by kind, stars, wall time, peak RSS) and exits non-zero when an hour fails, for example a 404 for an hour GH Archive has not published yet. `data/` is gitignored.

## build-ranking

```sh
bun run scripts/build-ranking.ts                                # current UTC season
bun run scripts/build-ranking.ts --season 2026-10 --data data
```

| Flag       | Default            | Meaning                                                           |
| ---------- | ------------------ | ----------------------------------------------------------------- |
| `--season` | current UTC season | Season, `YYYY-MM`.                                                |
| `--data`   | `data`             | Data root; reads `<data>/days/*.json`, writes `<data>/seasons/…`. |

It reads every day of the season that exists (missing days are skipped and listed), scores the season, and writes `seasons/<season>/candidates.json`, `tabs/global.json`, `tabs/poland.json`, `tabs/repositories.json`, all 256 `shards/<xx>.json`, then updates `seasons/index.json`, keeping other seasons. It prints the top 10 and a summary (days, contributors, excluded bots, repositories, candidates, bytes written, wall time) and exits non-zero when a day file is corrupt or a write fails. Without enrichment (before `enrich` ran for the season) the Poland board is empty and every merge counts as merged by someone else; afterwards it reads `repos.json`, `profiles.json` and `mergers.json` and scores pass 2.

## enrich

Needs `GITHUB_TOKEN` (any token that can read public data; read through Effect `Config`, never logged). Run `build-ranking` for the season first, it writes the candidates.

```sh
GITHUB_TOKEN="$(gh auth token)" bun run scripts/enrich.ts --season 2026-10 --data data
GITHUB_TOKEN=… bun run scripts/enrich.ts --contributors 100 --repositories 500 --pull-requests 0
```

| Flag              | Default            | Meaning                                                                             |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `--season`        | current UTC season | Season, `YYYY-MM`.                                                                  |
| `--data`          | `data`             | Data root; reads `<data>/seasons/<season>/candidates.json`, writes the files below. |
| `--contributors`  | all candidates     | Enrich only the first N candidate contributors (pass 1 rank order).                 |
| `--repositories`  | all candidates     | Enrich only the first N repositories.                                               |
| `--pull-requests` | all candidates     | Resolve mergers of only the first N pull requests.                                  |
| `--max-age-days`  | `7`                | Refetch entries older than this; a known merger is never refetched.                 |

It writes `seasons/<season>/repos.json`, `profiles.json` and `mergers.json` every 10 queries and at the end, so a rerun after a failure resumes from cached entries. Each query carries 100 aliases and costs about one point. It prints per kind requested, cached, fetched, missing (not found on GitHub), failed (other errors, retried next run), queries, cost and points remaining, then totals, and exits non-zero when a query fails after retries, the token is missing or rejected, or there are no candidates.
