---
name: adr-authoring
description: Creates or updates merged architecture decision records under docs/decisions. Use when the user asks for an ADR, decision record, architecture decision, accepted/proposed decision, or when domain-model work produces a hard-to-reverse trade-off such as a scoring, pipeline, storage, or module-boundary change.
---

# ADR Authoring

Use ADRs for durable architecture decisions, not routine implementation notes.

## Related Skills

- Use `domain-model` first for module boundaries, ownership, or language-heavy decisions.
- Use `ubiquitous-language` when the ADR introduces or changes domain terms.
- Use `.agents/skills/domain-model/ADR-FORMAT.md` for the ADR format.

## When An ADR Qualifies

Create or update an ADR only when all are true:

- The decision is hard to reverse.
- The decision would be surprising without context.
- The decision involved a real trade-off.

## Flow

1. Read existing ADRs in `docs/decisions`.
2. Read `.agents/skills/domain-model/ADR-FORMAT.md`.
3. Read `.agents/skills/domain-model/CONTEXT-FORMAT.md` when the ADR touches context boundaries.
4. Read `ARCHITECTURE.md`, the glossary, `PRODUCT.md`, the related issue, and code patterns.
5. Choose the next number by scanning all `docs/decisions/*.md` files and parsing the leading ADR number.
6. Use `docs/decisions/NNNN-short-slug.md`.
7. Match the existing repo style: title, status, date, context, decision, consequences, and related links when useful.
8. Link to `UBIQUITOUS_LANGUAGE.md` instead of duplicating large term tables.
9. Mark new ADRs `Proposed` unless the user says the decision is accepted.
10. Add the ADR to the decision table in `ARCHITECTURE.md`.

## Rules

- Keep ADRs concise but complete enough for a future agent to understand why.
- Record rejected alternatives when they would otherwise be suggested again.
- Scoring changes (weights, caps, popularity, exclusions) always get an ADR or an amendment to ADR 0002, plus a regression spec in `src/modules/ranking/domain/`.
- Include concrete dates, issue numbers, and affected modules when they clarify scope.
- Use `docs/decisions`, not generic `docs/adr`.
- Keep `UBIQUITOUS_LANGUAGE.md` for glossary terms and `ARCHITECTURE.md` or context docs for ownership.
- Do not create GitHub issues from an ADR unless the user asks.
- Do not commit ADR changes unless explicitly asked.
