# ADR 0002: Scoring Formula

**Status:** Accepted, to be revisited after the first backfill
**Date:** 2026-10-05
**Amended:** 2026-10-10 (per-repository cap replaced with diminishing returns per organisation, counted repositories, bot rules extended, see [Amendments](#amendments))

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
- Scoring constants live in `src/modules/ranking/domain/scoring.ts` with unit tests; bot rules live in `src/shared/github/bots.ts`, shared with `ingest`.

## Consequences

- **Known trade-off, to be revisited:** the cap is relative to the contributor's own total, so a contributor with a single repository keeps only 30% of their uncapped score, and anyone with fewer than four repositories cannot reach 100%. Dedicated maintainers of one project rank below people who spread small pull requests. Revisit with real data after the first backfill; options include a cap against a fixed floor instead of the contributor's own total, or applying the cap only from the fourth repository.
- Changing a weight or the cap reorders every season it is applied to; record such changes as an amendment here.
- Pass 1 standing uses archive proxies, so contributors outside the candidate set are scored without real stars.

## Notes

- **2026-10-05:** GH Archive stopped exposing `merged_by` in 2025; a merge is now `action: "merged"` with the author as actor. Ingest cannot tell self-merged from merged, so it keeps the numbers of those pull requests in the daily aggregate. Pass 2 resolves the merger through GitHub GraphQL for candidates only; every other merge into someone else's repository counts as merged.

## Amendments

### 2026-10-10: Diminishing returns per organisation replace the 30% cap

```
repoTerm   = Σ weight(merge kind) × count × log10(standing + 10)²
ownerScore = sqrt( Σ repoTerm over the owner's repositories )
score      = SCORE_SCALE × Σ ownerScore over owners, rounded to an integer
```

- **Why:** the cap was relative to the contributor's own total, so a maintainer who works on one project kept only 30% of their score and anyone with fewer than four repositories could not reach 100%. That punished exactly the dedicated contributors merged wants to show, the trade-off recorded above.
- **What replaces it:** diminishing returns per organisation: the square root is taken over all of an owner's repositories together (the `owner` in `owner/name`). For one repository this is sqrt(weighted pull requests) × log10(standing + 10), so 100 pull requests count like 10. Repositories of the same owner share one square root, so spreading pull requests over many tiny repositories of one organisation does not pay off (207 one-pull-request repositories under one owner score about sqrt(207) × 100, not 207 × 100), while work for different owners still adds up.
- **Why per owner, not per repository:** the first pass-1 run on 2026-10-01..04 with a per-repository square root put accounts with 20 to 73 tiny repositories under one organisation in the top 10, because every repository started a fresh square root.
- **Scale:** `SCORE_SCALE = 100`, so one merged pull request into an unknown repository is worth about 100 points and one into a 100k-star repository about 500. Scores are integers and ranks tie on integers. A repository's score in a breakdown is its share of the owner score (ownerScore × repoTerm / Σ repoTerm), rounded so the shares sum to the total.
- **Unchanged:** merge kind weights (merged 1, self-merged 0.5, own-repo 0), the `+ 10` popularity offset, repository standing, own-repo exclusion.
- **Dropped:** the rule that contributors with more than 95% of pull requests in one repository stay off the Global board. The square root already removes the payoff of farming one repository or one organisation, and a one-repository maintainer now belongs on the board.
- **Counted repositories:** A repository counts once someone besides you contributed to it or starred it this season, or it has at least 10 stars. In rule terms (`repositoryCounts` in `src/modules/ranking/domain/counts.ts`): another outside contributor merged into it this season, it got at least 3 stars this season, or enrichment reports at least 10 real stars. An uncounted repository keeps its pull requests in the breakdown with score 0 and `counted: false`; a contributor without any counted repository is kept in lookup at score 0, unranked, with `excluded: "noCountedRepository"`. Why: after the per-owner square root, the top of the 2026-10-01..04 run was led by accounts spreading pull requests over tiny repositories in many organisations they created (29 repositories under 21 owners, all with standing 1), which per-owner grouping cannot catch. Enrichment fetches real stars for the candidates' repositories, so for them the rule converges to real stars; other repositories use archive proxies for standing and the rule's season conditions (amended 2026-10-10: with the complete OpenDigger feed a season has hundreds of thousands of repositories, so enrichment covers every repository of the top contributors, at most 20,000, most merged pull requests first, instead of every repository of the season).
- **Bots:** the same run showed bots without the `[bot]` suffix in the top 10 (`copilot`, `release-service-bot`, `regro-cf-autotick-bot`). `isBot` in `src/shared/github/bots.ts` now also matches login patterns (documented in its JSDoc and the **Bot** glossary entry) and a longer known list. Ranking applies it to assembled logins as well, so day files ingested under older rules are cleaned without re-ingest; excluded bots stay in shards with `excluded: "bot"`.
- `CAP_PER_REPO`, `capScore` and `scoreRepo` are replaced by `repoTerm`, `scoreOwner` and `scoreBreakdown` in `src/modules/ranking/domain/scoring.ts`; `scoring.spec.ts` covers one repository, two repositories of one owner versus two owners, the 207-repository farm, and the breakdown summing to the total.

## Related

- [docs/plan.html](../plan.html), section Scoring
