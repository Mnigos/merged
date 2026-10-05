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

## Related

- [docs/plan.html](../plan.html), sections Pipeline and Ryzyka
- [ADR 0001: Stack And No-Database Architecture](./0001-stack-and-no-database-architecture.md)
