# ADR 0006: GitHub Search As An Ingest Source

**Status:** Accepted; since 2026-10-27 the workflows use the archive source again (Notes)
**Date:** 2026-10-12

## Context

Ingest read every merged pull request and star from GH Archive hour files. The official feed (`data.gharchive.org`) has lost most events since early 2026, and the OpenDigger mirror that replaced it (ADR 0004 notes) now throttles each client IP to about 20 KB/s, so even 24 one-hour parts on separate runners no longer fit a day into the job timeout. The pipeline needs a way to produce `days/<date>.json` without the mirror, without changing ranking, profiles, share or the website.

Measured on 2026-10-12 with a personal token against the GraphQL API:

- `search(type: ISSUE, query: "is:pr is:merged merged:2026-10-01T10:00:00Z..2026-10-01T10:00:59Z")` reports `issueCount` of at most about 700 for one minute, always under the 1,000 results search returns per query; about 40,000 per weekday hour, about 830,000 per day.
- A query takes 6–8 s and GitHub cuts it at about 10 s: `first: 100` mostly answers HTTP 502 or 504 with an HTML body, `first: 50` with the fields below succeeded 6 of 6 times, `first: 30` still sometimes answered 504.
- `rateLimit { cost remaining resetAt }` reports cost 1 per query; the primary limit is 5,000 points an hour for a personal token (1,000 for the Actions `GITHUB_TOKEN`).

## Decision

- **An `IngestSource` port** (`ingest/application/ingest-source.port.ts`) returns the merges, stars and counters of one UTC hour; `IngestDay` depends on it instead of `ArchiveSource`. Two adapters, picked by `toIngestLayer(source)` from `--source archive|search` or `INGEST_SOURCE`:
  - `archive` (default in code): `ArchiveSource` lines through `scanLine`, unchanged.
  - `search`: the GitHub search API through the shared `GitHubGraphql` client.
- **Search windows.** An hour is 60 one-minute windows, `is:pr is:merged is:public merged:<start>..<end>` with second precision and both ends inclusive (`T10:00:00Z..T10:00:59Z`), so windows never overlap. Each window is paged with `first: 50` and `after`. A window whose `issueCount` exceeds 1,000 is halved (30 s, then 15 s, …) down to `minWindowSeconds` (1 s), and the hour fails beyond that instead of truncating. `is:public` keeps a token's private repositories out, as GH Archive has only public events.
- **Fields:** `number mergedAt author { login __typename } mergedBy { login } repository { nameWithOwner databaseId owner { login } }`, plus `issueCount`, `pageInfo` and the rate limit. Stars come later from enrichment, so `stargazerCount` is not requested.
- **Mapping:** results are deduplicated by `databaseId` and number within the hour, a deleted author (`author: null`) is ignored and counted, a bot (`isBot`, or `__typename: Bot`, whose login has no `[bot]` suffix in GraphQL) is excluded and counted, and `classifyMerge` gets the merger GitHub reports. The output is the same `DailyAggregate` through the same `DayStore`.
- **Failures and limits:** the search source has its own `toGithubGraphqlHttpLayer({ concurrency: SEARCH_CONCURRENCY })` client (default 2 queries in flight, see Notes), so enrichment keeps one query at a time. The client retries 5xx, HTML bodies (now also a 200 that is not JSON) and network errors with jittered exponential backoff, waits out 429s and secondary-limit 403s (`retry-after` or 60 s) and pauses until `resetAt` below 100 points. The adapter retries a page three more times when GitHub answers errors without data (a search timeout), then fails the hour with `SearchSourceError` naming the window.
- **Workflows:** from 2026-10-12 to 2026-10-27 both ingest jobs set `INGEST_SOURCE: search` and `GITHUB_TOKEN` (`GH_PAT`, else the workflow token) on the ingest step. The 24 one-hour parts stay for v1 but run one at a time (`max-parallel: 1`, `timeout-minutes` unchanged), so a daily run is 24 sequential jobs of about 20 minutes, about 8 hours; with the archive source more parallelism would help, with search it cannot, because every part shares one token's secondary limit. An hourly cron is the follow-up redesign (see Consequences). Since 2026-10-27 the ingest jobs use the archive source again, with the parts in parallel (Notes).

## Consequences

- **No stars from search.** GitHub search has no WatchEvents, so a day ingested from search has `stars: 0` everywhere. Standing of repositories outside enrichment falls back to contributors only, and the counted rule's "at least 3 stars this season" sees only days ingested from GH Archive; contributors this season and enrichment's real stars (at least 10) still apply. To be revisited if star proxies matter for uncounted repositories.
- **Mergers known at ingest.** Every merge from search names its merger, so self-merges are classified for everyone, not only for candidates in pass 2 (ADR 0002 notes). Pass 2 still resolves mergers of candidates' `merged` pull requests; for search days that lookup is redundant.
- **Throughput is bound by GitHub's secondary rate limit, not bandwidth or points.** One token sustains about 27 search queries a minute (Notes), so an hour of merges takes about 20 minutes and a day of about 13,000 queries about 8 hours, however many jobs share the token. The 5,000 points an hour would allow a day in 2.6 hours; the workflow token's 1,000 points an hour would need 13. Run in parallel, 24 parts sharing one token would each get about 1.1 queries a minute and need about 8 hours, past the 300 min job timeout, hence `max-parallel: 1`; a backfill of 10 days is then 240 sequential jobs, about 80 hours. Follow-ups: one token per few parts, or an hourly cron that ingests the last complete hour as a day part (about 540 queries in 20 minutes, within even the workflow token's 1,000 points an hour) and a daily job that only merges and publishes.
- **Page size 50 is forced** by the 10 s server cut; 502 and 504 HTML answers are normal and retried, not fatal.
- The OpenDigger mirror and `ARCHIVE_BASE_URL` remain as `--source archive`, which also restores stars.

## Notes

- **2026-10-12, smoke test:** `ingest-day --date 2026-10-01 --hours 3-3 --source search --storage local` with a personal token and 4 queries in flight: 538 queries, 25,342 distinct pull requests (21,881 merges: 1,563 merged by someone else, 5,919 self-merged, 14,399 own-repo; 3,459 bot merges; 2 deleted authors; 8 merges without a merger), 4,718 contribution rows, 4,363 repositories, a 0.9 MB day part, 1,141 s wall, 149 MB peak RSS, no failed window. Minute windows reported 393–467 results (8–10 pages each); none needed a split. The run drew 35 GraphQL secondary rate limit 403s (`retry-after: 60`), so it averaged 28 queries a minute.
- **2026-10-12, concurrency probe** (same token, 50 per page): 2 queries in flight ran 81 queries in 181 s (27 a minute, median 4.4 s, p90 5.4 s) without a 403 or a 5xx; 3 in flight got the secondary limit after 56 s and averaged 24 a minute. `SEARCH_CONCURRENCY` therefore defaults to 2 instead of 4.
- **2026-10-27, archive is the default ingest source again:** `https://gharchive.open-digger.cn/<file>` now answers 302 to `https://gharchive.open-digger.net/<file>`, which Cloudflare serves at about 40 MB/s (a 438 MB hour file in about 10 s); the per-IP cap of about 0.5 MB/s from ADR 0004 no longer applies. `fetch` follows the redirect, and a resumed `Range` request with `If-Range` still gets a 206 through it. Hour 13 of 2026-10-26, run locally with `ingest-day --hours 13-13 --part --storage local --source archive`: 418.3 MB downloaded, 704,052 lines, 39,604 merges (14,704 into repositories the author does not own, 24,900 own-repo), 7,469 bot events, 25,039 star events, 10,288 contribution rows, 21,541 repositories, a 2.8 MB day part, 5.3 s wall, 290 MB peak RSS. The search job for the same hour (Actions run 40493910840): 1,059 queries, 43,205 merges (3,976 merged by someone else, 12,683 self-merged, 26,546 own-repo), 8,116 bot merges, 0 stars, 11,358 contribution rows, 10,343 repositories, 3,092 s wall. The archive sees about 92% of the merges search sees, because GH Archive drops some events, but is about 500 times faster than search, which took 8 to 18 hours a day, and has stars again. October 1 to 11 in storage were ingested from the archive too. Both workflows' ingest jobs therefore set `INGEST_SOURCE: archive`, no longer pass `GITHUB_TOKEN` to the ingest step, and run the 24 parts with `max-parallel: 20` and a 30 min timeout. Search stays available as `--source search` / `INGEST_SOURCE=search` with `GITHUB_TOKEN`, for example if the mirror slows down again; the hourly cron follow-up is not needed while the archive source works.

## Options Considered

- **Keep the mirror:** rejected on 2026-10-12; at about 20 KB/s per IP a 300–650 MB hour does not fit a job. Chosen again on 2026-10-27, after the mirror moved behind Cloudflare (Notes).
- **Official GH Archive feed:** rejected; it has lost most events since 2026.
- **`first: 100` or larger windows:** rejected; most such queries time out at the server.
- **More queries in flight:** rejected as a default; past two, the secondary limit costs more than parallelism gains.

## Related

- [ADR 0002: Scoring Formula](./0002-scoring-formula.md)
- [ADR 0004: Pipeline On GitHub Actions With Vercel Blob](./0004-pipeline-on-github-actions-with-vercel-blob.md)
- [UBIQUITOUS_LANGUAGE.md](../../UBIQUITOUS_LANGUAGE.md): **Ingest source**, **Search window**
