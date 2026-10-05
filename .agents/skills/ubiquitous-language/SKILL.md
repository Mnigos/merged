---
name: ubiquitous-language
description: Maintains the repo root UBIQUITOUS_LANGUAGE.md glossary for merged's domain terms (seasons, contributors, merged pull requests, scores, boards, enrichment, sharing) and ambiguous product language. Use when defining domain language, resolving term conflicts, naming Schema or services, updating ADR terminology, or when the user mentions ubiquitous language, domain model, bounded context, or glossary.
---

# Ubiquitous Language

Use this skill to keep merged domain language explicit and consistent across docs, code names, Schema names, and UI copy.

## Flow

1. Read `UBIQUITOUS_LANGUAGE.md`.
2. Scan the current conversation, relevant ADRs, issues, and touched code/docs for domain terms.
3. Identify synonyms, overloaded terms, vague terms, and boundary confusion.
4. Pick canonical terms and update `UBIQUITOUS_LANGUAGE.md`.
5. If another artifact defines many terms, link to the root glossary instead of duplicating a large table.
6. Summarize added terms, renamed aliases, and any remaining ambiguity.

## File Shape

Keep the root glossary in this shape:

```md
# Ubiquitous Language

## <Subdomain>

| Term               | Definition               | Aliases to avoid    |
| ------------------ | ------------------------ | ------------------- |
| **Canonical term** | One-sentence definition. | synonym, vague term |

## Relationships

- **Term A** owns or produces **Term B**.

## Example Dialogue

> **Dev:** "Short question using the terms?"
>
> **Domain expert:** "Short answer clarifying ownership."

## Flagged Ambiguities

- "ambiguous word" should mean **Canonical term** in this context.
```

## Rules

- Be opinionated; choose one canonical term.
- Keep definitions to one sentence.
- Include aliases to avoid when they prevent future confusion.
- Include only domain terms; skip generic programming terms unless repo-specific.
- Group terms by natural product/domain area (Contributions, Pipeline, Ranking, Sharing).
- Preserve existing good terms and evolve definitions only when understanding changes.
- Code names follow the glossary: `Season`, `Contributor`, `MergeKind`, `Board`, not synonyms. UI copy may say "tab" where the glossary allows it.
- Separate domain concepts from infrastructure, helpers, adapters, and mapping code.
- Keep `UBIQUITOUS_LANGUAGE.md` as the source of truth for glossary terms; module ownership stays in `ARCHITECTURE.md`.
