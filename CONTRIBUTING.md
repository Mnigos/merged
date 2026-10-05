# Contributing

Run commands from the repository root with Bun.

## Pick up work

Read the issue and its discussion before changing code. Choose a plain, descriptive branch name without an agent prefix.

Keep changes focused. Check nearby implementations and the relevant documentation before adding a new pattern:

- [Architecture](ARCHITECTURE.md) and [domain vocabulary](UBIQUITOUS_LANGUAGE.md) explain module ownership and terminology.
- [Product](PRODUCT.md) and the [plan](docs/plan.html) guide user-facing changes.
- [Architecture decisions](docs/decisions) record existing trade-offs.
- [AGENTS.md](AGENTS.md) and [skills](.agents/skills) contain detailed implementation rules for coding agents.

## Daily development

```sh
bun install --frozen-lockfile
bun run dev
```

| Task                     | Command              |
| ------------------------ | -------------------- |
| Unit tests               | `bun run test`       |
| Unit tests in watch mode | `bun run test:watch` |
| Lint and format check    | `bun run check`      |
| Typecheck                | `bun run typecheck`  |
| Build                    | `bun run build`      |

Use `bun run test`, not `bun test`. Vitest runs the specs; `bun test` invokes Bun's own runner.

## Code conventions

- Put code in the owning module under `src/modules/<module>/` and the right layer; see [ARCHITECTURE.md](ARCHITECTURE.md#dependency-rules).
- Use TypeScript, descriptive names, kebab-case file names, and the `@modules/…` and `@shared/…` aliases across boundaries.
- Decode untrusted data (GH Archive, Blob JSON, GitHub API, request input) with Effect Schema at the boundary.
- Keep React components free of Effect; they receive data from loaders and server functions.
- Add regression coverage for changed behavior in a `*.spec.ts` next to the code. Every scoring change needs a case.
- Keep secrets in ignored local environment files. Never put secrets in `VITE_*` variables, which are exposed to clients.

## Before review

```sh
bun run typecheck
bun run check:fix
bun run test
bun run build
```

`check:fix` runs Ultracite with unsafe fixes enabled. Inspect its diff before committing. CI runs `check`, `typecheck`, `test`, and `build`.

Installation enables Husky. The pre-commit hook runs Ultracite (oxlint + oxfmt) on staged files; the commit-message hook enforces [Conventional Commits](https://www.conventionalcommits.org), e.g. `feat(ranking): add percentile shards`.

Explain the problem, the resulting behavior, and the checks run in the pull request. Include desktop and mobile screenshots for visible UI changes. Never include secrets, Blob dumps, or build output.
