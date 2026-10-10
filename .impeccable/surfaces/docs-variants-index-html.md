---
version: 1
slug: "docs-variants-index-html"
primary_target: "src/routes/index.tsx"
related_targets: ["src/routes/u.$login.tsx", "docs/variants/d-canon.html"]
---

# Surface: homepage `/` (and the share card it feeds)

Scope: Persuade. The visitor arrives from a link on X, on a phone, in the evening. The working action is the GitHub-login lookup; the top list is the proof. Seed key: eca402fc (concept-seed --scope direction --mode persuade).

## Grounded candidates (ordered by resonance)

1. FIDE monthly rating list (printed bulletin: rank, name, federation, rating, +/-, games)
2. Marathon race results sheet and finisher certificate (bib lookup, percentile, splits)
3. Billboard Hot 100 chart page (this week / last week / peak / weeks on chart)
4. Arcade high-score table (initials, attract mode)
5. Football league standings (form, zones)
6. Split-flap departures board (monthly flip)
7. Election-night results board (percent reporting, projected vs called, result bars)  ← ASSIGNED by the roll

Rut kept out of the list: the dark dev dashboard with a neon accent (the page this category always ships, and the user's rejected first mockup), and its predictable opposite, the cream editorial serif page. The name's literal reading (GitHub's purple "Merged" state) was not spent.

## Challenger verdicts (fused with product facts, judged on audience identification and product clarity)

- ASCII live scene: declined (phosphor-on-black collides with the user's anti-reference; a glyph-density scene does not clarify a ranking). Raise adopted: one strict column grid with tabular numerals across the whole board.
- Drum-machine step row: declined (neither axis). Raise adopted: one unbroken season strip across the top that always shows where "now" is (day 5 of 31).
- Jacquard punched brocade: declined. Raise adopted: full traceability from a score down to each merged PR (breakdown is a first-class state).
- Cephalopod skin language: declined. Raise adopted: a single signal color reserved for the visitor's own row and nothing else.
- Code-cascade terminal: declined (anti-reference collision; cliché). Raise adopted: narrow screens show one readable pane first, the lookup, before the board.
- Hatch Show Print letterpress poster: COMPETITIVE. Holds audience identification (a bill of names in ranked type sizes is a hierarchy everyone reads instantly) and reads well on a tall phone; product clarity for numbers is weaker than the board. Built as a full alternate.

## Cards put before the user (code-led; no image generation in this harness)

- A. Assigned: election-night results board → docs/variants/a-board.html
- B. Impeccable's pick (top of the grounded list): FIDE monthly rating list → docs/variants/b-rating-list.html. Honest risk: the most familiar of the three; a plain list.
- C. Competitive challenger: letterpress gig poster → docs/variants/c-poster.html
- Standing exit (not built): the category standard, a clean leaderboard table like committers.top, played straight.

Direction contract: to be written after the user's choice.

## Round 1 outcome (2026-10-05)

User reviewed A, B, C. Verdict: none felt beautiful; B's structure was the most sensible. User named the standing exit in their own words: products this should sit alongside are Raycast, Resend, Linear and PostHog; dark theme primary. Per new-work.md, convention is now the commitment: execute the dark dev-tool product canon at those products' craft level, played straight. Recorded in PRODUCT.md as a brand commitment.

## Direction contract (canon, code-led)

THESIS: A dark dev-tool product page where the visitor's own merged-PR result is the hero object, rendered in the vocabulary GitHub uses for a merged pull request (purple "Merged" state). Refuses the category's arrangement of a big top-100 table under a slogan; the list is proof, the result is the product.
OWN-WORLD: near-black tinted ground with two elevated surfaces, 1px tinted borders with a lighter top edge, one accent (merged purple) for action, selection and the visitor's row; small semantic green/red for movement; Inter for everything with tight display tracking; JetBrains Mono only for numbers and logins in data cells; soft offset shadows; one restrained accent glow behind the hero.
STORY: arrive from X, type a login, see "merged 41 times this month, #4 of 212,418, top 0.02%", share it in one tap, then scroll the proof list.
FIRST VIEWPORT (mobile): header with wordmark, Methodology, ⌘K; headline "Who actually got merged this month."; one-line sub; the lookup field as a command-bar; the result card in merged state directly below; tabs and the list begin below the fold. Desktop: copy and lookup left, result card right, list full width below.
FORM: canon (user's named competitors), seed key eca402fc, round resolved as canon.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Approval (2026-10-05)

User approved variant D (docs/variants/d-canon.html, the named canon: Raycast, Resend, Linear, PostHog, dark) as the design direction for the homepage and the share card. A, B and C are archived and must not be revisited. Implementation inherits D's world: tinted near-black ground, 1px tinted borders, white primary buttons, Inter with tight display tracking, JetBrains Mono for logins and repository names only, merged purple as the single accent, the result rendered as a merged pull request.

## Implemented (2026-10-10)

Shipped on `/` and `/u/$login` from D's tokens in `src/styles.css`; components live in `src/modules/ranking/presentation/components/` and `src/shared/ui/`.
Dropped until data exists: rank delta, language tabs, badge button, "projected".
