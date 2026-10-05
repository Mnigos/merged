---
name: ui-components
description: Reusable UI primitives in src/shared/ui and module components in presentation/components for merged: Tailwind 4 tokens, variants, props conventions, and accessibility. Use when building or modifying React components or shared UI primitives.
---

Use this skill for React components: shared primitives in `src/shared/ui/` and product components in `src/modules/<module>/presentation/components/`.

## First Read

Before editing, read:

- This skill.
- At least 3 similar existing component files when they exist.
- `src/styles.css` for design tokens, `PRODUCT.md` for brand commitments, and the approved mockup `docs/variants/d-canon.html` for visual direction.
- Any imported primitive or helper whose API you are not already certain about.

Use those files as the source of truth. Prefer live repo patterns over examples in this skill.

## Working Rules

- `src/shared/ui/` holds domain-free primitives (button, tabs, table, avatar frame). Anything that knows about scores, seasons, or contributors belongs in a module's `presentation/components/`.
- Export named components; do not add default exports (route files are the exception TanStack requires).
- Use `ComponentProps<'element'>` for native props and spread the rest onto the element.
- Put props interfaces immediately above the component and use `Readonly<ComponentNameProps>`.
- Add variants only when multiple consumers or states need a stable API. If a class-variance helper is introduced, add it to oxfmt `sortTailwindcss.functions` and use it consistently.
- Use the design tokens in `src/styles.css` (`bg`, `fg`, `fg-2`, …) instead of raw colors.
- Prefer `size-*` over paired `h-* w-*`; prefer Tailwind scale units over arbitrary values.
- Components never import `effect` and never fetch; they render plain props.
- Keep server-rendered output meaningful without JavaScript; meet WCAG AA contrast; respect `prefers-reduced-motion`.
- Do not create barrel files.

## Common Decisions

- Keep component APIs small; pass domain data into module components, not into shared primitives.
- Numbers (score, rank, percentile) are formatted by module helpers, not inside primitives.
- For app screens or visual polish, also use `web-app-patterns` and `impeccable`.

## Verification

- Run `bun run typecheck`.
- Run `bun run check:fix`.
- For visible UI changes, capture desktop and mobile screenshots in the running app and follow [UI screenshots](../pull-request/SKILL.md#ui-screenshots) before reporting completion.
