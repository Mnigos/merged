# Ubiquitous Language

This is the shared glossary for merged domain terms. Use it in issues, ADRs, code names, Schema names, logs, and PR descriptions.

This file is not a context document. Module ownership lives in [ARCHITECTURE.md](ARCHITECTURE.md).

## Core DDD

| Term                    | Definition                                                                                  | Aliases to avoid              |
| ----------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| **Bounded context**     | A product area with its own model, rules, and language; one folder in `src/modules/`.       | folder, feature, service      |
| **Application service** | Effect service that runs one module's use cases and is the only way other modules reach it. | manager, controller, helper   |
| **Port**                | Service shape an application layer needs from the outside world, implemented by an adapter. | interface, client, repository |
| **Adapter**             | Infrastructure Layer that implements a port against GH Archive, GitHub, or Vercel Blob.     | driver, wrapper, service      |
| **Ubiquitous language** | Shared domain vocabulary used by product, engineering, docs, and issues.                    | context, architecture doc     |

## Contributions

| Term                       | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Aliases to avoid                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Contributor**            | A GitHub account identified by its login that authored at least one merged pull request in a season.                                                                                                                                                                                                                                                                                                                                                                        | user, author, developer, account |
| **Merged pull request**    | A pull request whose `PullRequestEvent` in GH Archive is closed with `merged: true`.                                                                                                                                                                                                                                                                                                                                                                                        | PR, contribution, commit         |
| **Merge kind**             | Who merged a merged pull request and where: merged by someone else, self-merged, or own-repo.                                                                                                                                                                                                                                                                                                                                                                               | merge type, PR type              |
| **Merged by someone else** | Merge kind where a login other than the contributor merged the pull request; weight 1.                                                                                                                                                                                                                                                                                                                                                                                      | normal merge, external merge     |
| **Self-merged**            | Merge kind where the contributor merged their own pull request in a repository they do not own; weight 0.5.                                                                                                                                                                                                                                                                                                                                                                 | maintainer merge, auto-merge     |
| **Own-repo**               | Merge kind for a pull request into a repository owned by the contributor's own login; weight 0.                                                                                                                                                                                                                                                                                                                                                                             | personal repo, self repo         |
| **Exclusion**              | Rule that removes a login or pull request from scoring: bots (by `isBot`, including `r-ryantm` and `juliaregistrator`; they also do not count as repository contributors or towards standing), own-repo pull requests, and repositories of manually excluded owners (`EXCLUDED_REPOSITORY_OWNERS` in `src/shared/github/excluded-repositories.ts`, for example the `merge-demo` merge queue demo). A contributor without a counted repository is kept at score 0, unranked. | filter, ban, blocklist           |
| **Bot**                    | Login excluded as automation: `[bot]` suffix; ending in `-bot`, `_bot`, `.bot`, `robot`, or `bot` after a digit or after an automation prefix (`ci`, `release`, `svc`, …); ending in `-ci` or `-queue` (merge queues such as `webkit-commit-queue`); starting with `svc-` or `bot-`; `copilot` as a login token; or on the known bot list. Surnames like `talbot` stay human. Always excluded.                                                                              | automation, app account          |

## Pipeline

| Term                | Definition                                                                                                                                                   | Aliases to avoid             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| **GH Archive hour** | One hourly gzipped JSON lines file from GH Archive; a day has 24.                                                                                            | dump, event file             |
| **Daily aggregate** | Per-day rollup of merged pull requests per contributor and repository plus WatchEvents per repository.                                                       | day file, daily stats, cache |
| **Enrichment**      | Fetching real stars and language of the candidates' repositories, and name, location, avatar and pull request mergers of candidates, through GitHub GraphQL. | sync, scraping, hydration    |
| **Candidate**       | Contributor or repository that pass 1 scoring selects for enrichment.                                                                                        | shortlist, top users         |
| **Scoring pass**    | Pass 1 scores with archive proxies to pick candidates; pass 2 rescores with enriched stars.                                                                  | run, iteration               |

## Ranking

| Term                    | Definition                                                                                                                                                                                                                                                                                    | Aliases to avoid                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Season**              | One calendar month (UTC) of merged pull requests, identified as `YYYY-MM`.                                                                                                                                                                                                                    | period, round, month board       |
| **Provisional season**  | The current season; recomputed daily and can still change.                                                                                                                                                                                                                                    | live season, current ranking     |
| **Final season**        | A season after its month closed and the last recompute ran; its results no longer change.                                                                                                                                                                                                     | archived, past ranking           |
| **Repository standing** | Popularity of a repository in a season: distinct contributors plus stars, as the `popularity` input to scoring. A repository counts once someone besides you contributed to it or starred it this season, or it has at least 10 stars. An uncounted repository scores 0 for its contributors. | repo score, repo rank, weight    |
| **Score**               | A contributor's season total in integer points: weighted merged pull requests times log10 repository standing, with diminishing returns per organisation: the square root is taken over all of an owner's repositories together.                                                              | points, XP, rating, karma        |
| **Rank**                | A contributor's 1-based position on a board by score.                                                                                                                                                                                                                                         | place, position, rating          |
| **Percentile**          | Share of scored contributors in the season with a lower score than this contributor.                                                                                                                                                                                                          | top %, ranking %                 |
| **Board**               | One tab of the leaderboard with its own ranks: Global, Poland, or a language.                                                                                                                                                                                                                 | tab (in code), list, leaderboard |
| **Shard**               | One of 1024 Blob files (100–300 KB) holding score, rank, and percentile for every contributor, keyed by login hash.                                                                                                                                                                           | page, chunk, partition           |

## Sharing

| Term           | Definition                                                                     | Aliases to avoid            |
| -------------- | ------------------------------------------------------------------------------ | --------------------------- |
| **Share card** | 1200×630 image of a contributor's season result, rendered for link previews.   | OG card, screenshot, poster |
| **Share text** | Prefilled post text that links to a contributor's result.                      | tweet, caption              |
| **Badge**      | shields.io endpoint JSON with a contributor's rank or percentile for a README. | shield, widget, sticker     |

## Relationships

- **Ingest** turns **GH Archive hours** into one **Daily aggregate** per day.
- **Ranking** sums **Daily aggregates** of a **Season**, applies **Exclusions**, and runs **Scoring pass** 1 to pick **Candidates**.
- **Profiles** performs **Enrichment** of **Candidates**; it never decides who is a candidate.
- **Ranking** runs **Scoring pass** 2 with enriched **Repository standing** and writes **Boards**, **Shards**, and the season index.
- A **Provisional season** becomes a **Final season** after the first recompute following the month's end.
- **Share** renders **Share cards**, **Share text**, and **Badges** from **Ranking** and **Profiles** results.

## Example Dialogue

> **Dev:** "Does a self-merged pull request count towards the score?"
>
> **Domain expert:** "Yes, at half weight. An own-repo pull request is a Merge kind too, but it weighs zero."
>
> **Dev:** "And a contributor with one popular repository?"
>
> **Domain expert:** "They keep their full score, with diminishing returns per organisation: the square root is taken over all of an owner's repositories together, so a hundred trivial pull requests count like ten and spreading them over one organisation's tiny repositories does not help either. Work for different owners still adds up. ADR 0002 records why the old 30% cap was dropped."

## Flagged Ambiguities

- "User" is ambiguous; use **Contributor** for a scored GitHub login and "visitor" for someone browsing the site.
- "Contribution" is what other leaderboards count; here only a **Merged pull request** scores.
- "Tab" is a UI word; the domain term is **Board** (Blob paths keep `tabs/` from the plan).
- "Popularity" in code means **Repository standing**; do not use it for contributors.
- "Live" and "current" season should be **Provisional season**; "past" should be **Final season**.
- "Domain" means invariants, Schema, and pure rules, not GH Archive parsing or Blob I/O.
