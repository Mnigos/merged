# merged

_Working name._

A monthly leaderboard of open source contributors, computed only from pull requests that someone else merged into repositories the author does not own, weighted by project popularity and capped per repository. Seasons reset every calendar month and the formula is public. Product context lives in [PRODUCT.md](PRODUCT.md).

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md): modules, layers, dependency rules, data files.
- [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md): domain vocabulary.
- [docs/decisions](docs/decisions): architecture decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md): workflow and code rules.
- [docs/plan.html](docs/plan.html): plan, scoring formula, architecture and data pipeline.
- [docs/variants/d-canon.html](docs/variants/d-canon.html): approved design mockup. Open it in a browser.
- Archived explorations, kept for reference only: `docs/variants/a-board.html`, `docs/variants/b-rating-list.html`, `docs/variants/c-poster.html` and `docs/design.html`.

## Stack

- [Bun](https://bun.sh) as package manager and runtime
- [TanStack Start](https://tanstack.com/start) (React 19, Vite, Nitro with the `vercel` preset)
- [Tailwind CSS 4](https://tailwindcss.com), design tokens in `src/styles.css`
- TypeScript 7, strict
- [Effect 4](https://effect.website) for the data pipeline (`scripts/`), application services, and server functions
- [Vitest](https://vitest.dev) with `@effect/vitest`, specs as `*.spec.ts` next to the code
- [oxlint](https://oxc.rs) (type-aware via `oxlint-tsgolint`) and oxfmt through [Ultracite](https://www.ultracite.ai) presets

## Layout

A modular monolith in one package; rules in [ARCHITECTURE.md](ARCHITECTURE.md).

- `src/modules/<module>/`: bounded contexts `ingest`, `ranking`, `profiles`, `share`, each layered into `domain/`, `application/`, `infrastructure/`, `presentation/`
- `src/shared/`: cross-module kernel (Schema helpers, JSON storage on GitHub Releases or Blob, GitHub client, config, errors, UI primitives, utils)
- `src/routes/`: thin file-based routes
- `src/runtime/`: app composition root for server functions
- `scripts/`: data pipeline entrypoints, see [scripts/README.md](scripts/README.md)

## Commands

```sh
bun install
bun run dev                # dev server on http://localhost:3000
bun run check              # lint and format check
bun run check:fix          # lint and format fix
bun run typecheck
bun run test
bun run build
bun run scripts/smoke.ts   # proves Effect runs under Bun
```

## Pipeline

GitHub Actions run the data pipeline and store every file as a public JSON asset of a GitHub Release in this repository (tags `days-<YYYY-MM>`, `season-<YYYY-MM>`, `index`); the website reads the same files by their download URL without a token. `.github/workflows/pipeline.yml` runs daily at 06:00 UTC in two stages: 24 parallel jobs ingest yesterday's GH Archive data from the [OpenDigger mirror](https://gharchive.open-digger.cn) (the official feed has lost most events since 2026), one hour each, because the mirror caps every client IP at about 0.5 MB/s; a publish job merges the 24 parts into the day file and runs `scripts/pipeline.ts`, which scores the season, enriches candidates through GitHub GraphQL, and scores again. `.github/workflows/backfill.yml` does the same for up to 20 days on demand. Both can be started from the Actions tab. Commands, flags and local runs are in [scripts/README.md](scripts/README.md); the reasoning is in [ADR 0004](docs/decisions/0004-pipeline-on-github-actions-with-vercel-blob.md) and [ADR 0005](docs/decisions/0005-data-files-on-github-releases.md). Vercel Blob stays available as `--storage blob` / `DATA_SOURCE=blob`.

```sh
GITHUB_TOKEN="$(gh auth token)" bun run scripts/pipeline.ts --date 2026-10-03   # local disk under data/
```

| Where                 | Name                   | Value                                                                                                                                                                                   |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow env          | `DATA_REPOSITORY`      | Set by the workflows to `${{ github.repository }}`; defaults to `Mnigos/merged`. The workflows need `permissions: contents: write`.                                                     |
| GitHub Actions secret | `GH_PAT` (recommended) | Classic PAT with `public_repo`: writes the release assets and gets 5,000 REST requests and GraphQL points an hour; without it the workflow token (1,000 REST requests an hour) is used. |
| Vercel environment    | `DATA_SOURCE`          | `github`; the website reads release assets without a token. `DATA_REPOSITORY` is optional (setting it also selects `github`). No Blob variables are needed.                             |

## Impeccable

[Impeccable](https://github.com/pbakaus/impeccable) is installed in the project (`.claude/skills/impeccable`, `.agents/skills/impeccable`). `PRODUCT.md` is its product context.

## Agent skills

Project skills live in `.agents/skills/`; `.claude/skills/<name>` symlinks to them. `CLAUDE.md` is a symlink to `AGENTS.md`.
