# ADR 0003: Modular DDD Layout In One Package

**Status:** Accepted
**Date:** 2026-10-05

## Context

The pipeline scripts and the web app share the same rules (Schema of Blob files, scoring, exclusions) and the same adapters (Blob, GitHub). The original plan put everything shared in `src/domain/` and `src/server/`, which mixes ingest, ranking, enrichment, and sharing concerns and leaves no rule for where Effect services, adapters, and UI go. Rigtch uses per-module `domain`/`application`/`infrastructure`/`presentation` layers successfully, but across a NestJS API and a monorepo that merged does not need.

## Decision

- One package, a modular monolith: bounded contexts in `src/modules/` (`ingest`, `ranking`, `profiles`, `share`), a kernel in `src/shared/`.
- Each module is layered: `domain` (pure), `application` (Effect services and ports), `infrastructure` (adapters), `presentation` (components and server functions). A `<module>.layer.ts` wires the module.
- Dependencies point inwards; modules talk through application services; the kernel never imports modules. Thin routes in `src/routes/`, thin scripts in `scripts/`.
- oxlint enforces no barrel files and the main import boundaries.

## Options Considered

- **Flat `src/domain` + `src/server`** (the plan): rejected; it grows into one shared bucket with no ownership.
- **Monorepo with `packages/domain`** like Rigtch: rejected; one deployable and one consumer do not justify workspaces, and it can be extracted later.
- **Rigtch virtual file routes inside modules:** deferred; file-based routes in `src/routes/` stay simpler while there are five routes.

## Consequences

- More folders than a weekend project strictly needs; empty layers are not created.
- Moving a module to its own package later is a folder move because nothing imports its internals.
- Details and the import table live in [ARCHITECTURE.md](../../ARCHITECTURE.md).
