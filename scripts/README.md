# scripts

Data pipeline run by GitHub Actions (daily cron at 06:00 UTC) with Bun and Effect. Each script is a composition root: it parses arguments, merges module Layers, and calls application services in `src/modules/`. No domain logic lives here. See [ARCHITECTURE.md](../ARCHITECTURE.md) and [ADR 0004](../docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md).

| Command                          | Modules               | Does                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest-day --date YYYY-MM-DD`   | `ingest`              | Streams the day's 24 GH Archive files from the OpenDigger mirror, keeps only `PullRequestEvent` and `WatchEvent` lines before parsing, decodes and aggregates them, writes `days/<date>.json` to local disk or Vercel Blob.              |
| `enrich --season YYYY-MM`        | `ranking`, `profiles` | Reads the candidates `build-ranking` picked in scoring pass 1; `profiles` fetches real stars, contributor profiles and pull request mergers through batched GitHub GraphQL with retry and rate limit waits, caches them in season files. |
| `pipeline`                       | all                   | The daily job in one process: ingest, then `build-ranking → enrich → build-ranking`, over a write-through cache so each step reads what the previous one wrote. Used by both workflows.                                                  |
| `build-ranking --season YYYY-MM` | `ranking`             | Sums the season's daily aggregates, scores them (pass 1 now, pass 2 once enrichment exists), writes candidates, boards, percentiles, shards and `seasons/index.json`. Scoring rules live in `src/modules/ranking/domain/`.               |

The daily order is `ingest-day`, `build-ranking` (pass 1 picks candidates), `enrich`, `build-ranking` again (pass 2); `pipeline` runs it in one process, the single-step scripts stay for local and manual runs. `smoke.ts` proves Effect runs under Bun:

```sh
bun run scripts/smoke.ts
```

## Storage

Every script takes `--storage local|blob` (default `local`). `local` reads and writes under the data root (`--data`, or `--out` for `ingest-day`, default `data`); `blob` uses the Vercel Blob store and ignores the data root. Paths are the same in both, for example `days/2026-10-03.json`. Blob files are public JSON, written in place and cached for 60 s; the CDN may serve the previous version of a file for up to a minute after an overwrite, so only `pipeline` (one process, write-through cache) is safe for chained steps on Blob.

| Variable                | Needed by                           | Meaning                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`          | `enrich`, `pipeline`                | Token for GitHub GraphQL. A classic PAT with `public_repo` or no scopes gets 5,000 points an hour; the Actions `GITHUB_TOKEN` works but has a smaller per-repository budget.                                     |
| `BLOB_READ_WRITE_TOKEN` | every script with `--storage blob`  | Read-write token of the Vercel Blob store, read at the first write; reads do not need it. Never logged.                                                                                                          |
| `BLOB_BASE_URL`         | every script with `--storage blob`  | Public store URL such as `https://xxxx.public.blob.vercel-storage.com`, no trailing slash. Reads go to `<BLOB_BASE_URL>/<path>`.                                                                                 |
| `ARCHIVE_BASE_URL`      | `ingest-day`, `pipeline` (optional) | Base URL of the hourly archive files, `<ARCHIVE_BASE_URL>/<YYYY-MM-DD>-<H>.json.gz`. Default `https://gharchive.open-digger.cn` (OpenDigger mirror); `https://data.gharchive.org` is the degraded official feed. |

## GitHub Actions

`.github/workflows/pipeline.yml` runs daily at 06:00 UTC and on manual dispatch (optional `date` and `season`) one step: `bun run scripts/pipeline.ts --storage blob`. `.github/workflows/backfill.yml` is manual and runs `pipeline.ts --storage blob --from <from> --date <to>` (plus `--season` when set). A day takes 5–10 minutes on the OpenDigger mirror (about 9.5 GB), so keep a backfill range under about 20 days per run; the job times out after 6 hours, the daily `pipeline.yml` after 90 minutes. Both share the `pipeline` concurrency group and never run at the same time. Secrets `BLOB_READ_WRITE_TOKEN` and optional `GH_PAT`, variable `BLOB_BASE_URL`.

## pipeline

Needs `GITHUB_TOKEN` like `enrich`; it is read before anything runs.

```sh
GITHUB_TOKEN="$(gh auth token)" bun run scripts/pipeline.ts --date 2026-10-03     # local disk under data/
GITHUB_TOKEN=… bun run scripts/pipeline.ts --storage blob                        # yesterday, as the cron does
GITHUB_TOKEN=… bun run scripts/pipeline.ts --storage blob --from 2026-10-01 --date 2026-10-09
```

| Flag                                    | Default           | Meaning                                                               |
| --------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `--date`                                | yesterday UTC     | Last day to ingest, `YYYY-MM-DD`.                                     |
| `--from`                                | `--date`          | First day to ingest; days run one after another.                      |
| `--season`                              | month of `--date` | Season to rank and enrich.                                            |
| `--storage`                             | `local`           | `local` or `blob`, see Storage.                                       |
| `--data`                                | `data`            | Data root for `local`.                                                |
| `--skip-existing`, `--no-skip-existing` | on                | Skip days whose file already exists; `--no-skip-existing` re-ingests. |

Steps: ingest every day from `--from` to `--date`; when `--date` is the first of a month, `build-ranking → enrich → build-ranking` for the season that just closed, so its pass 2 newcomers are enriched before the final build; then `build-ranking → enrich → build-ranking` for `--season`. It prints each step and its report and stops at the first error. Every module shares one storage with a write-through cache: a step reads what an earlier step of the same run wrote, even while the Blob CDN still serves the previous version.

## ingest-day

```sh
bun run scripts/ingest-day.ts --date 2026-10-03                 # all 24 hours
bun run scripts/ingest-day.ts --date 2026-10-03 --hours 15      # one hour
bun run scripts/ingest-day.ts --date 2026-10-03 --hours 0-5 --concurrency 2 --out data
bun run scripts/ingest-day.ts --date 2026-10-03 --storage blob --skip-existing
```

| Flag              | Default | Meaning                                                      |
| ----------------- | ------- | ------------------------------------------------------------ |
| `--date`          | none    | UTC day, `YYYY-MM-DD`. Required.                             |
| `--hours`         | `0-23`  | Range `a-b` or comma list `1,5,9`.                           |
| `--concurrency`   | `4`     | GH Archive hours streamed at the same time.                  |
| `--out`           | `data`  | Output root; the aggregate goes to `<out>/days/<date>.json`. |
| `--storage`       | `local` | `local` or `blob`, see Storage.                              |
| `--skip-existing` | off     | Exit 0 without downloading when the day file already exists. |

It prints per-hour and day metrics (bytes, lines, pre-filtered lines, decoded events, merges by kind, stars, wall time, peak RSS) and exits non-zero when an hour fails, for example a 404 for an hour GH Archive has not published yet; that error names the hour and says the day is not complete in the archive yet. With `--skip-existing` and an existing day it prints `<date> already ingested, skipping` instead. `data/` is gitignored.

## build-ranking

```sh
bun run scripts/build-ranking.ts                                # current UTC season
bun run scripts/build-ranking.ts --season 2026-10 --data data
bun run scripts/build-ranking.ts --season 2026-10 --storage blob
```

| Flag        | Default            | Meaning                                                           |
| ----------- | ------------------ | ----------------------------------------------------------------- |
| `--season`  | current UTC season | Season, `YYYY-MM`.                                                |
| `--data`    | `data`             | Data root; reads `<data>/days/*.json`, writes `<data>/seasons/…`. |
| `--storage` | `local`            | `local` or `blob`, see Storage.                                   |

It reads every day of the season that exists (missing days are skipped and listed), scores the season, and writes `seasons/<season>/candidates.json`, `tabs/global.json`, `tabs/poland.json`, `tabs/repositories.json`, all 1024 `shards/<xxx>.json`, then updates `seasons/index.json`, keeping other seasons. It prints the top 10 and a summary (days, contributors, excluded bots, repositories, candidates, bytes written, wall time) and exits non-zero when a day file is corrupt or a write fails. Without enrichment (before `enrich` ran for the season) the Poland board is empty and every merge counts as merged by someone else; afterwards it reads `repos.json`, `profiles.json` and `mergers.json` and scores pass 2.

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
| `--storage`       | `local`            | `local` or `blob`, see Storage.                                                     |
| `--contributors`  | all candidates     | Enrich only the first N candidate contributors (pass 1 rank order).                 |
| `--repositories`  | all candidates     | Enrich only the first N repositories.                                               |
| `--pull-requests` | all candidates     | Resolve mergers of only the first N pull requests.                                  |
| `--max-age-days`  | `7`                | Refetch entries older than this; a known merger is never refetched.                 |

It writes `seasons/<season>/repos.json`, `profiles.json` and `mergers.json` every 10 queries and at the end, so a rerun after a failure resumes from cached entries. Each query carries 100 aliases and costs about one point. It prints per kind requested, cached, fetched, missing (not found on GitHub), failed (other errors, retried next run), queries, cost and points remaining, then totals, and exits non-zero when a query fails after retries, the token is missing or rejected, or there are no candidates.
