# ADR 0004: Pipeline On GitHub Actions With Vercel Blob

**Status:** Accepted
**Date:** 2026-10-05

## Context

A day of GH Archive is 24 gzipped hourly files. The leaderboard needs one recompute per day, the GitHub API only for enrichment, and zero running cost. There is no database to write to (ADR 0001).

## Decision

- **Three commands** in `scripts/`, run daily at 06:00 UTC by a GitHub Actions cron with Bun:
  - `ingest-day --date`: stream the day's files, drop lines without a `PullRequestEvent` or `WatchEvent` prefix before parsing, decode with Schema, write one daily aggregate. Four files in parallel.
  - `enrich --season`: scoring pass 1, pick candidates (top 5,000 contributors, top 50,000 for profiles), batched GraphQL with 100 aliases per query, retry with backoff, a 1,500 points per minute limiter, results cached in Blob.
  - `build-ranking --season`: scoring pass 2, boards, percentiles, shards, season index.
- **Vercel Blob** holds every file as JSON; the layout is in [ARCHITECTURE.md](../../ARCHITECTURE.md#data-files-in-blob). Each file has one writer module.
- A separate backfill workflow runs `ingest-day` as a matrix over dates.

## Consequences

- Results lag up to a day; the UI shows the provisional season's day of the month.
- GitHub API use stays within 5,000 points per hour only through batching; a larger candidate set needs a second token or fewer profiles.
- Blob secrets live in GitHub Actions secrets and Vercel environment variables, read through Effect `Config`.

## Notes

- **2026-10-05, measured:** a full day (2026-10-03) is 528 MB gzipped and 1.95 M lines; the substring pre-filter drops 94.5% before parsing. `ingest-day` with four hours in parallel took 6–10 s wall with 311–533 MB peak RSS on a laptop, bound by download speed. The planned split into four 6-hour jobs and the DuckDB fallback are not needed.
- **2026-10-10, enrichment measured:** `enrich` fetches real stars for every repository of the season, not the top 50,000 profiles: whether a repository counts depends on real stars (ADR 0002 amendment). Contributor profiles and mergers are fetched for the top 3,000 candidates and their merged pull requests. Results are cached per season in `repos.json`, `profiles.json` and `mergers.json` and refetched after 7 days (a known merger never). On 2026-10-01..04 the first run took 262 queries of 100 aliases for 262 points (18,872 repositories, 2,660 contributors, 4,511 pull requests) in 18 minutes; a second run after pass 2 needed 54 queries for the new candidates. There is no points-per-minute limiter: queries run one at a time, and GitHub's secondary rate limit (403 with `retry-after: 60`) hit about every 50 queries and is waited out by the adapter, which also pauses when fewer than 100 points remain.
- **2026-10-10, workflow shape:** both workflows run one step, `scripts/pipeline.ts --storage blob`, in one process: ingest (yesterday by default, a `--from`..`--date` range for backfill, existing days skipped), then `build-ranking` (pass 1, picks candidates), `enrich`, `build-ranking` (pass 2). On the first of a month the same chain runs first for the season that just closed, so its pass 2 newcomers are enriched before its final build. One process, not one workflow step per command: Vercel serves public Blob URLs through a CDN, and an overwritten file can be served in its previous version for up to 60 s even with `cache-control: no-cache`, so separate processes could read the previous generation of `candidates.json` or the profile files. All modules share one `writeThroughJsonStorageLayer` that serves a run's own writes from memory. `build-ranking` runs twice because each run regenerates the candidates from its own scoring; newcomers of pass 2 are enriched by the next run, and cached entries cost nothing. Backfill is not a matrix: days run sequentially in the same process (a day takes about 10 s). Both workflows share the `pipeline` concurrency group without cancelling, so they never write Blob at the same time. Without a `GH_PAT` secret `enrich` uses the workflow's `GITHUB_TOKEN`, which works but has a smaller per-repository GraphQL budget; a classic PAT with `public_repo` or no scopes gets the 5,000-point hourly budget.

## Related

- [docs/plan.html](../plan.html), sections Pipeline and Ryzyka
- [ADR 0001: Stack And No-Database Architecture](./0001-stack-and-no-database-architecture.md)
