# ADR 0005: Data Files On GitHub Releases

**Status:** Accepted
**Date:** 2026-10-11

## Context

ADR 0004 stored every data file in Vercel Blob. With the complete OpenDigger feed the pipeline writes hundreds of MB a day (a 25 MB daily aggregate, a few MB of candidates and enrichment files, 1024 shards of 100–300 KB written twice per run) and thousands of put operations per build. Vercel suspended the Hobby Blob store under that load. The project must stay at zero cost without new accounts, and the website only needs public, unauthenticated reads of files that change once a day.

## Decision

- Every data file is a **GitHub Release asset of this repository** (`Mnigos/merged`, `DATA_REPOSITORY` overrides it). `src/shared/storage/github-release-json-storage.ts` implements `JsonStorage`; `toReleaseAsset` maps paths to releases:

  | Path                       | Release tag       | Asset                                                                    |
  | -------------------------- | ----------------- | ------------------------------------------------------------------------ |
  | `days/<YYYY-MM-DD>.json`   | `days-<YYYY-MM>`  | `<YYYY-MM-DD>.json`                                                      |
  | `seasons/index.json`       | `index`           | `index.json`                                                             |
  | `seasons/<YYYY-MM>/<rest>` | `season-<YYYY-MM>` | `<rest>` with `/` replaced by `-` (`tabs-global.json`, `shards-2f.json`) |

- Releases are created on first write as prereleases named like the tag, with `make_latest: false` and a one-line body saying they hold pipeline data, so they never become the repository's latest release.
- The pipeline workflows in this repository (`pipeline.yml`, `backfill.yml`) run `scripts/pipeline.ts --storage github` with `permissions: contents: write`, `DATA_REPOSITORY: ${{ github.repository }}` and `GITHUB_TOKEN` (`GH_PAT` when set, else the workflow token). A write looks the release up by tag (or creates it). A new file is uploaded under its name (1 call). An existing one is uploaded as `<asset>.tmp`, the old asset deleted, and the temporary one renamed with `PATCH /releases/assets/{id}` (3 calls); a stale `<asset>.tmp` of an interrupted run is deleted first. Release ids and asset lists are cached per tag for the run, and at most 4 writes run at once.
- The website reads `https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>` without a token and follows the redirect to GitHub's asset storage. GitHub resolves the asset by name on every request, so an overwrite is visible at once. `DATA_SOURCE=github` (or a set `DATA_REPOSITORY`) selects it.
- Shards go to 128 (two hex characters `00`–`7f`, the low 7 bits of FNV-1a). Measured on 2026-10-11 with 5 days of October: 128 shards of about 250 KB (31.8 MB in total); full-month shards will be larger.
- The pipeline's first build of a season per run (scoring pass 1) runs with `publish: 'candidatesOnly'` and writes only `candidates.json`; pass 2 writes every file. `build-ranking --candidates-only` exposes the same mode.
- The Vercel Blob adapter stays as `--storage blob` / `DATA_SOURCE=blob`, no longer the default.
- No migration of the 1024 three-character shards: nothing was published to releases before this change, so the first publication to releases happens after it and writes 128 two-character shards from the start.

## Consequences

- Zero cost and no extra account; data lives next to the code that writes it. Files are public, as they were on Blob.
- No CDN staleness on reads. GitHub cannot rename onto an existing name, so an overwrite deletes the old asset before renaming `<asset>.tmp`; a read that gets a 404 retries once on `<asset>.tmp`, so a read during the rename falls back to the temporary asset and never sees the file missing. A truly missing file costs two requests. Chained pipeline steps still rely on the run's write-through cache.
- Content-creating REST calls (POST, PATCH, DELETE) of an ordinary daily run: 1 for the new day file, 3 for pass 1 `candidates.json`, about 21 for enrichment checkpoints (about 7 file writes: each of the three files every 10 batches and at the end), and 399 for pass 2 (133 overwritten files: candidates, 128 shards, three boards, index, × 3), about **424** in total, plus a few lookups and listings. That stays under GitHub's documented secondary limit of 500 content-creating requests an hour and the workflow token's 1,000 REST requests an hour. On the first of a month the closed season's chain runs too, about 850 calls; `GH_PAT` (classic, `public_repo` scope, 5,000 an hour) is recommended for that day and for backfills. Secondary limits (also about 80 a minute) may still slow a run; the adapter waits for `retry-after`, `x-ratelimit-reset` or a minute and retries, never on a permission 403. To be revisited after the first full month of daily runs.
- GitHub limits a release to 1,000 assets and an asset to 2 GB; the largest release holds about 136 assets and the largest file is the 25–50 MB daily aggregate.
- Release tags (`index`, `days-*`, `season-*`) appear in this repository's tag list.
- Writes to the same path must not overlap; the pipeline writes each file from one process at a time.

## Related

- [ADR 0004: Pipeline On GitHub Actions With Vercel Blob](./0004-pipeline-on-github-actions-with-vercel-blob.md), storage part superseded
- [ARCHITECTURE.md, Data files](../../ARCHITECTURE.md#data-files)
