# scripts

Data pipeline run by GitHub Actions (daily cron at 06:00 UTC) with Bun and Effect. Each script is a composition root: it parses arguments, merges module Layers, and calls application services in `src/modules/`. No domain logic lives here. See [ARCHITECTURE.md](../ARCHITECTURE.md), [ADR 0004](../docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md) and [ADR 0005](../docs/decisions/0005-data-files-on-github-releases.md).

| Command                          | Modules               | Does                                                                                                                                                                                                                                         |
| -------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest-day --date YYYY-MM-DD`   | `ingest`              | Streams the day's 24 GH Archive files from the OpenDigger mirror, keeps only `PullRequestEvent` and `WatchEvent` lines before parsing, decodes and aggregates them, writes `days/<date>.json` to local disk, GitHub Releases or Vercel Blob. |
| `merge-day --date YYYY-MM-DD`    | `ingest`              | Reads the day parts `ingest-day --part` wrote on parallel runners, checks they cover hours 0–23 once, merges them into the daily aggregate and writes `days/<date>.json` to the chosen storage.                                              |
| `enrich --season YYYY-MM`        | `ranking`, `profiles` | Reads the candidates `build-ranking` picked in scoring pass 1; `profiles` fetches real stars, contributor profiles and pull request mergers through batched GitHub GraphQL with retry and rate limit waits, caches them in season files.     |
| `pipeline`                       | all                   | The daily job in one process: ingest, then `build-ranking → enrich → build-ranking`, over a write-through cache so each step reads what the previous one wrote. Used by both workflows.                                                      |
| `build-ranking --season YYYY-MM` | `ranking`             | Sums the season's daily aggregates, scores them (pass 1 now, pass 2 once enrichment exists), writes candidates, boards, percentiles, shards and `seasons/index.json`. Scoring rules live in `src/modules/ranking/domain/`.                   |

The daily order is `ingest-day`, `build-ranking --candidates-only` (pass 1 picks candidates and writes only them), `enrich`, `build-ranking` again (pass 2, every file); `pipeline` runs it in one process, the single-step scripts stay for local and manual runs. `smoke.ts` proves Effect runs under Bun:

```sh
bun run scripts/smoke.ts
```

## Storage

Every script takes `--storage local|github|blob` (default `local`). `local` reads and writes under the data root (`--data`, or `--out` for `ingest-day`, default `data`); `github` and `blob` ignore it. Paths are the same everywhere, for example `days/2026-10-03.json`.

`github` stores each file as a release asset of `DATA_REPOSITORY` (default `Mnigos/merged`): `days/<YYYY-MM-DD>.json` → release `days-<YYYY-MM>`, asset `<YYYY-MM-DD>.json`; `seasons/index.json` → release `index`, asset `index.json`; `seasons/<YYYY-MM>/<rest>` → release `season-<YYYY-MM>`, asset `<rest>` with `/` replaced by `-` (`tabs-global.json`, `shards-2f.json`). Reads fetch `https://github.com/<repository>/releases/download/<tag>/<asset>` without a token and see an overwrite at once. Writes need `GITHUB_TOKEN` with write access to the repository's contents: a missing release is created as a prerelease that never becomes latest; a new file is uploaded under its name, and an existing one is uploaded as `<asset>.tmp`, the old asset deleted and the temporary one renamed (a stale `.tmp` of an interrupted run is deleted first), and a read that gets a 404 retries once on `<asset>.tmp`, so a read during the rename falls back to the temporary asset. At most 4 writes run at once; 5xx, network errors and rate limits are retried with backoff. `blob` uses the Vercel Blob store, whose CDN may serve the previous version of a file for up to a minute. On either remote store only `pipeline` (one process, write-through cache) is safe for chained steps.

| Variable                | Needed by                                            | Meaning                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`          | `enrich`, `pipeline`, writes with `--storage github` | Token for GitHub GraphQL and release writes, never logged. A classic PAT with `public_repo` gets 5,000 points and 5,000 REST requests an hour; the Actions `GITHUB_TOKEN` (with `contents: write`) works but allows 1,000 REST requests an hour. |
| `DATA_REPOSITORY`       | `--storage github` (optional)                        | `owner/name` of the repository whose releases hold the files. Default `Mnigos/merged`; the workflows set `${{ github.repository }}`.                                                                                                             |
| `BLOB_READ_WRITE_TOKEN` | writes with `--storage blob`                         | Read-write token of the Vercel Blob store, read at the first write; reads do not need it. Never logged.                                                                                                                                          |
| `BLOB_BASE_URL`         | `--storage blob`                                     | Public store URL such as `https://xxxx.public.blob.vercel-storage.com`, no trailing slash. Reads go to `<BLOB_BASE_URL>/<path>`.                                                                                                                 |
| `ARCHIVE_BASE_URL`      | `ingest-day`, `pipeline` (optional)                  | Base URL of the hourly archive files, `<ARCHIVE_BASE_URL>/<YYYY-MM-DD>-<H>.json.gz`. Default `https://gharchive.open-digger.cn` (OpenDigger mirror); `https://data.gharchive.org` is the degraded official feed.                                 |

## GitHub Actions

The OpenDigger mirror serves each client IP at about 0.5 MB/s, whatever the number of connections, so one runner needs about 4.5 hours for a day (about 8 GB). Each Actions job gets its own IP, so both workflows ingest a day as four day parts in parallel and publish in a second stage:

```
prepare   the day (pipeline.yml: input or yesterday) or the days (backfill.yml: from..to, at most 20)
ingest    matrix date × part 0-5, 6-11, 12-17, 18-23; max-parallel 20, fail-fast off, 150 min, contents: read
          ingest-day --date <d> --hours <part> --part --out data --storage local --concurrency 6
          → artifact day-<d>-<part> = data/days/<d>.part-<part>.json, kept 3 days
publish   needs every ingest job; contents: write, concurrency group pipeline, 120 min
          download every day-* artifact into data/days
          merge-day --date <d> --parts 0-5,6-11,12-17,18-23 --storage github --from-directory data   (each day)
          pipeline.ts --storage github --date <last day> [--season]   (ingest skipped: the day exists)
```

`.github/workflows/pipeline.yml` runs daily at 06:00 UTC and on manual dispatch (optional `date` and `season`). `.github/workflows/backfill.yml` is manual (`from`, `to`, optional `season`) and refuses ranges over 20 days (80 ingest jobs). A failed part blocks `publish`; "Re-run failed jobs" reruns only the failed parts and then publishes, while the other artifacts stay. Only `publish` is in the `pipeline` concurrency group, so two runs never write releases at the same time; ingest jobs only read the mirror. `ARCHIVE_BASE_URL` comes from the repository variable `vars.ARCHIVE_BASE_URL` when it is set. `publish` sets `DATA_REPOSITORY: ${{ github.repository }}` and `GITHUB_TOKEN` to the `GH_PAT` secret when present, else the workflow token, for its write steps only; an ordinary daily run makes about 424 content-creating REST requests (see ADR 0005); a classic `GH_PAT` with `public_repo` is recommended for the first of a month (about 850) and backfills.

## pipeline

Needs `GITHUB_TOKEN` like `enrich`; it is read before anything runs.

```sh
GITHUB_TOKEN="$(gh auth token)" bun run scripts/pipeline.ts --date 2026-10-03     # local disk under data/
GITHUB_TOKEN=… bun run scripts/pipeline.ts --storage github                      # yesterday, as the cron does
GITHUB_TOKEN=… bun run scripts/pipeline.ts --storage github --from 2026-10-01 --date 2026-10-09
```

| Flag                                    | Default           | Meaning                                                               |
| --------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `--date`                                | yesterday UTC     | Last day to ingest, `YYYY-MM-DD`.                                     |
| `--from`                                | `--date`          | First day to ingest; days run one after another.                      |
| `--season`                              | month of `--date` | Season to rank and enrich.                                            |
| `--storage`                             | `local`           | `local`, `github` or `blob`, see Storage.                             |
| `--data`                                | `data`            | Data root for `local`.                                                |
| `--skip-existing`, `--no-skip-existing` | on                | Skip days whose file already exists; `--no-skip-existing` re-ingests. |

Steps: ingest every day from `--from` to `--date`; when `--date` is the first of a month, `build-ranking → enrich → build-ranking` for the season that just closed, so its pass 2 newcomers are enriched before the final build; then `build-ranking → enrich → build-ranking` for `--season`. It prints each step and its report and stops at the first error. Every module shares one storage with a write-through cache: a step reads what an earlier step of the same run wrote, even while the remote store briefly misses or serves an older version of a file.

## ingest-day

```sh
bun run scripts/ingest-day.ts --date 2026-10-03                 # all 24 hours
bun run scripts/ingest-day.ts --date 2026-10-03 --hours 15      # one hour
bun run scripts/ingest-day.ts --date 2026-10-03 --hours 0-5 --concurrency 2 --out data
bun run scripts/ingest-day.ts --date 2026-10-03 --storage github --skip-existing
```

| Flag              | Default | Meaning                                                                                                                                                                     |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--date`          | none    | UTC day, `YYYY-MM-DD`. Required.                                                                                                                                            |
| `--hours`         | `0-23`  | Range `a-b` or comma list `1,5,9`.                                                                                                                                          |
| `--concurrency`   | `4`     | GH Archive hours streamed at the same time.                                                                                                                                 |
| `--out`           | `data`  | Output root; the aggregate goes to `<out>/days/<date>.json`.                                                                                                                |
| `--storage`       | `local` | `local`, `github` or `blob`, see Storage.                                                                                                                                   |
| `--skip-existing` | off     | Exit 0 without downloading when the day file already exists.                                                                                                                |
| `--part`          | off     | Write the day part `<out>/days/<date>.part-<hours>.json` instead of the day file. Needs `--hours` as a range or one hour and `--storage local`; not with `--skip-existing`. |

With `--part` the aggregate of the given hours goes to `days/<date>.part-<hours>.json` (`--hours 0-5` → `days/2026-10-03.part-0-5.json`), for `merge-day`. Parts are local files only: release asset names accept only day files, so `--part` with `--storage github` or `blob` fails.

It prints per-hour and day metrics (bytes, lines, pre-filtered lines, decoded events, merges by kind, stars, wall time, peak RSS) and exits non-zero when an hour fails, for example a 404 for an hour GH Archive has not published yet; that error names the hour and says the day is not complete in the archive yet. With `--skip-existing` and an existing day it prints `<date> already ingested, skipping` instead. `data/` is gitignored.

## merge-day

```sh
bun run scripts/merge-day.ts --date 2026-10-03 --parts 0-5,6-11,12-17,18-23              # data/days/… → data/days/2026-10-03.json
bun run scripts/merge-day.ts --date 2026-10-03 --parts 0-11,12-23 --from-directory parts --storage github
```

| Flag               | Default | Meaning                                                                              |
| ------------------ | ------- | ------------------------------------------------------------------------------------ |
| `--date`           | none    | UTC day, `YYYY-MM-DD`. Required.                                                     |
| `--parts`          | none    | Comma list of part labels (the `--hours` of each `ingest-day --part` run). Required. |
| `--from-directory` | `data`  | Local root holding the parts at `<dir>/days/<date>.part-<label>.json`.               |
| `--storage`        | `local` | Where the merged day goes: `local`, `github` or `blob`, see Storage.                 |
| `--data`           | `data`  | Data root for `--storage local`.                                                     |

The labels must cover hours 0–23 exactly once (`0-5,6-12` fails: hours 13–23 are in no part; `0-12,12-23` fails: hour 12 is in both). It reads every part, fails naming a missing one, merges them (rows, own-repo merges, stars and totals summed; merge authors recounted; a pull request number repeated in a row counted once) and writes `days/<date>.json`, then prints the totals, rows, repositories and output size. Merging hour parts gives the same file as one `ingest-day` over all hours unless the archive repeats a merge event across parts.

## build-ranking

```sh
bun run scripts/build-ranking.ts                                # current UTC season
bun run scripts/build-ranking.ts --season 2026-10 --data data
bun run scripts/build-ranking.ts --season 2026-10 --storage github
bun run scripts/build-ranking.ts --season 2026-10 --candidates-only   # pass 1: candidates.json only
```

| Flag                | Default            | Meaning                                                             |
| ------------------- | ------------------ | ------------------------------------------------------------------- |
| `--season`          | current UTC season | Season, `YYYY-MM`.                                                  |
| `--data`            | `data`             | Data root; reads `<data>/days/*.json`, writes `<data>/seasons/…`.   |
| `--storage`         | `local`            | `local`, `github` or `blob`, see Storage.                           |
| `--candidates-only` | off                | Score and write only `candidates.json`; no shards, boards or index. |

It reads every day of the season that exists (missing days are skipped and listed), scores the season, and writes `seasons/<season>/candidates.json`, `tabs/global.json`, `tabs/poland.json`, `tabs/repositories.json`, all 128 `shards/<xx>.json`, then updates `seasons/index.json`, keeping other seasons (with `--candidates-only` only the candidates). It prints the top 10 and a summary (what it published, days, contributors, excluded bots, repositories, candidates, bytes written, wall time) and exits non-zero when a day file is corrupt or a write fails. Without enrichment (before `enrich` ran for the season) the Poland board is empty and every merge counts as merged by someone else; afterwards it reads `repos.json`, `profiles.json` and `mergers.json` and scores pass 2.

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
| `--storage`       | `local`            | `local`, `github` or `blob`, see Storage.                                           |
| `--contributors`  | all candidates     | Enrich only the first N candidate contributors (pass 1 rank order).                 |
| `--repositories`  | all candidates     | Enrich only the first N repositories.                                               |
| `--pull-requests` | all candidates     | Resolve mergers of only the first N pull requests.                                  |
| `--max-age-days`  | `7`                | Refetch entries older than this; a known merger is never refetched.                 |

It writes `seasons/<season>/repos.json`, `profiles.json` and `mergers.json` every 10 queries and at the end, so a rerun after a failure resumes from cached entries. Each query carries 100 aliases and costs about one point. It prints per kind requested, cached, fetched, missing (not found on GitHub), failed (other errors, retried next run), queries, cost and points remaining, then totals, and exits non-zero when a query fails after retries, the token is missing or rejected, or there are no candidates.
