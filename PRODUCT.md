# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TanStack Start (React 19), Tailwind 4, TypeScript 7, Effect 4 RC for the data pipeline, deployed on Vercel. Data comes from GH Archive through a daily GitHub Action into Vercel Blob as JSON. No database, no accounts. Confirmed by the user during planning; see docs/plan.html.

## Users

Primary (confirmed): software developers who arrive from a link in a post on X (secondarily Hacker News or Reddit), mostly on a phone, in the evening or during a break. They come to check their own rank and, if it is good, share it.

Secondary (inferred): developers browsing the top 100 out of curiosity; people writing data stories about GitHub activity.

## Product Purpose

A monthly leaderboard of open-source contributors computed only from pull requests that someone else merged into repositories the author does not own, weighted by project popularity, with diminishing returns per organisation: the square root is taken over all of an owner's repositories together. A repository counts once someone besides you contributed to it or starred it this season, or it has at least 10 stars. It exists because contribution-count leaderboards (committers.top, top-github-users, Rang Forge) are dominated by bot-like accounts, and cumulative rankings favor decade-long veterans. Success: visitors check their rank, share the card on X, and come back next month; the repository earns stars and the author earns recognition.

## Positioning

"Open source contributors who actually got merged." Every point requires another person's merge decision, which a script cannot fake. Seasons reset monthly. The formula is published. No login needed to see your result.

## Operating Context

Visitor flow: link on X, page opens, visitor types a GitHub login, sees rank, score, percentile and a per-repository breakdown, then shares the card to X or copies a README badge. Data recomputes daily at 06:00 UTC; a season is a calendar month and the current day of the month is visible. Tabs: Global, Poland, and languages (TypeScript, Rust, Python, Go). Routes: `/`, `/u/:login`, `/og/:login.png`, `/api/badge/:login`, `/methodology`.

## Capabilities and Constraints

- Static JSON read through server functions; OG images rendered with satori; no client-side auth.
- Realistic ranges: about 200,000 scored contributors per month; top 100 per tab; scores in the low thousands at the top; 1 to 60 merged PRs per person per month typical, a few hundred for extreme maintainers.
- Lookup outcomes: found with rank; found below the top (percentile only); not found (no merged PRs this month); excluded (bot or own-repo only).
- States: season in progress (day N of 31), finished season, data refreshing, lookup loading, not found, empty tab (for a language with few entries early in the month).
- English UI. The Polish audience gets a Poland tab, not a Polish interface.
- Avatars are real GitHub avatars; repository names and star counts are real.
- Must load fast on a phone over cellular. The share image must read at X's link-preview size (1200×630) and at thumbnail size.

## Brand Commitments

- Working name "merged". Binding only if the name and a good domain are available (user's words); until checked, treat the name as likely but unconfirmed.
- Voice (inferred from the planning conversation, not user-stated): plain, factual, a little dry, confident about the method. No hype. The user described the app as "for fun", so playfulness is allowed; trophies, streaks and confetti are an inferred anti-goal, not a stated one.
- Explicit anti-reference from the user: the first mockup in docs/design.html (near-black ground, lime and mint neon accent, gradient initial avatars, pill chips, glass header). The user called it "total slop". Do not return to that world.
- Visual anchors (user-stated, binding): the interface should sit alongside Raycast, Resend, Linear and PostHog in craft and feel. Dark theme as the primary theme (user-stated). The three exploratory worlds in docs/variants (results board, rating list, letterpress poster) were reviewed and declined by the user as "not pretty"; the user preferred the rating list's structure but asked for a full rethink.
- Built by Mnigos (GitHub @Mnigos) as a public, personal-brand project.

## Evidence on Hand

- docs/plan.html: plan, scoring formula, architecture.
- docs/design.html: rejected first mockup, kept only as an anti-reference.
- No real ranking data yet. All demonstration data in mocks is synthetic and must be labeled as such. No testimonials, user counts, or press exist; do not invent any.
- Verified neighbors: committers.top, gayanvoice/top-github-users, rang-forge.netlify.app, gitista.com, gitlist.sh, hikariming/ghfind.

## Product Principles

1. Every number can be explained in one sentence; the formula is public.
2. The visitor's own result is the product; the top list is the proof.
3. One gesture from result to share.
4. Credibility over excitement.
5. The phone in the evening is the first screen.

## Accessibility & Inclusion

WCAG AA contrast. The ranking must be readable without JavaScript (server rendered). Respect prefers-reduced-motion. (Inferred baseline, not a user-stated requirement.)
