# ADR 0001: Stack And No-Database Architecture

**Status:** Accepted
**Date:** 2026-10-05

## Context

merged recomputes a monthly leaderboard once a day from public GH Archive data and serves read-only pages, a share card, and a badge. There are no accounts and no writes from visitors. The project is a weekend-sized personal build that should cost nothing to run and stay alive without maintenance.

## Decision

- **One TanStack Start app** (React 19, Vite, Nitro `vercel` preset). Server functions replace an API server; there is no oRPC contract and no monorepo until a second consumer exists.
- **Effect 4** for the pipeline and the server side: Stream, Schema, Layer, Schedule. React components stay plain. Effect is pinned to an exact version.
- **No database, no worker.** GitHub Actions compute, Vercel Blob stores JSON through `@vercel/blob`, Vercel serves. New results appear without a redeploy.
- **Tooling from Rigtch:** oxlint with Ultracite presets and `oxlint-tsgolint`, oxfmt, TypeScript 7, Vitest with `@effect/vitest`, Tailwind 4.

## Consequences

- Every read is a Blob fetch behind a server function with a one-hour cache; per-contributor lookups need precomputed shards instead of queries.
- Search, history across seasons, and anything per-visitor need a precomputed file or, later, a database.
- Login, notifications, and a public API stay out of scope until a database exists.
- Effect API changes are contained to `scripts/`, application, infrastructure, and server function handlers.

## Related

- [docs/plan.html](../plan.html), sections Decyzje and Architektura
- [ADR 0004: Pipeline On GitHub Actions With Vercel Blob](./0004-pipeline-on-github-actions-with-vercel-blob.md)
