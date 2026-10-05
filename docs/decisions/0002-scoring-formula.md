# ADR 0002: Scoring Formula

**Status:** Accepted, to be revisited after the first backfill
**Date:** 2026-10-05

## Context

Existing leaderboards count contributions anyone can inflate with a script, or sum all time so the same veterans always lead. merged counts only what another person had to accept, resets every month, and publishes its formula. Terms follow [UBIQUITOUS_LANGUAGE.md](../../UBIQUITOUS_LANGUAGE.md).

## Decision

```
score(contributor) = Σ per repository min( Σ weight(merge kind) × log10(standing + 10), 0.3 × uncapped total )
```

- **Merge kind weights:** merged by someone else 1, self-merged 0.5, own-repo 0.
- **Repository standing:** distinct contributors plus stars in the season (pass 1); real stars from GitHub GraphQL for candidates (pass 2). The `+ 10` offset gives an unknown repository a weight of about 1, so farms of tiny repositories do not pay off.
- **Per-repository cap:** one repository contributes at most 30% of the contributor's uncapped total.
- **Exclusions:** bots (`[bot]` suffix and a known list) and own-repo pull requests. Contributors with more than 95% of pull requests in one repository stay off the Global board but keep their result in lookup.
- All constants live in `src/modules/ranking/domain/scoring.ts` with unit tests.

## Consequences

- **Known trade-off, to be revisited:** the cap is relative to the contributor's own total, so a contributor with a single repository keeps only 30% of their uncapped score, and anyone with fewer than four repositories cannot reach 100%. Dedicated maintainers of one project rank below people who spread small pull requests. Revisit with real data after the first backfill; options include a cap against a fixed floor instead of the contributor's own total, or applying the cap only from the fourth repository.
- Changing a weight or the cap reorders every season it is applied to; record such changes as an amendment here.
- Pass 1 standing uses archive proxies, so contributors outside the candidate set are scored without real stars.

## Related

- [docs/plan.html](../plan.html), section Scoring
