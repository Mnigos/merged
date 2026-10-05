# ADR Format

ADRs live in `docs/decisions/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.

Use the existing repo title style:

```md
# ADR 0004: {Short Title Of The Decision}
```

## Template

```md
# ADR NNNN: {Short title of the decision}

**Status:** Proposed
**Date:** YYYY-MM-DD

## Context

{What is happening, what constraints matter, and why this decision is needed.}

## Decision

{What we decided and why.}

## Consequences

{Non-obvious downstream effects, trade-offs, and follow-up work.}

## Related

- #123: {GitHub issue title}
- ADR NNNN: {related decision}
```

## Rules

- Keep ADRs as short as the decision allows.
- New ADRs default to `Proposed` unless the user says the decision is accepted.
- Include `Context`, `Decision`, and `Consequences` when the decision affects architecture, module ownership, scoring, the pipeline, Blob file layout, or production reliability.
- Add `Options Considered` only when rejected alternatives are likely to be suggested again.
- Mark trade-offs that must be checked again with real data as "to be revisited" and say when.
- Link to `UBIQUITOUS_LANGUAGE.md` instead of duplicating glossary tables.
- Use concrete dates, issue numbers, module names, and Blob paths when they clarify scope.
- To change an accepted ADR, add an `**Amended:**` date and an `## Amendments` section, or supersede it with a new ADR.

## Numbering

Scan all `docs/decisions/*.md` files, parse the leading ADR number, then increment the highest number by one.

## When To Offer An ADR

All three must be true:

1. **Hard to reverse**: changing the decision later has meaningful cost.
2. **Surprising without context**: a future reader would wonder why the code or architecture is shaped this way.
3. **Real trade-off**: there were genuine alternatives and we picked one for specific reasons.

## What Qualifies

- Architecture shape, such as module boundaries or layer rules.
- Scoring formula, weights, caps, and exclusions.
- Pipeline and storage choices, such as Blob file layout or sharding.
- Technology choices with lock-in, such as Effect, Vercel Blob, or the hosting preset.
- Deliberate deviations from the obvious path.
- Constraints not visible in code.
- Rejected alternatives that would otherwise reappear.
