---
name: utils-helpers
description: Utils and helpers organization for merged: global utils in src/shared/utils, module helpers next to the layer that uses them, pure functions, JSDoc, and extraction decisions. Use when extracting or modifying reusable utility/helper functions.
---

Use this skill when extracting or changing helper functions, utils, shared transformations, parsing helpers, or small reusable domain functions.

## First Read

Before editing, read:

- This skill.
- At least 3 similar existing util or helper files when they exist.
- Any imported helper, external utility, or domain type whose API you are not already certain about.

Use those files as the source of truth. Prefer live repo patterns over examples in this skill.

## Working Rules

- Utils are global, domain-agnostic, and live in `src/shared/utils/`.
- Helpers are module-specific and may contain domain logic. Pure domain rules belong in the module's `domain/`; presentation-only formatting (labels, number display) in `presentation/helpers/`.
- File names are kebab-case.
- All exported utils and helpers have JSDoc.
- Prefer pure functions with descriptive names. Domain logic that needs no service is a plain function in `domain/`, not an Effect service method.
- Do not create helpers whose only purpose is defensive coercion for already-typed internal values. Avoid generic `unknown` → fallback wrappers unless the input is genuinely untrusted.
- Parse untrusted input with Effect Schema (`effect-schema` skill), not hand-written type guards.
- Do not hide invalid data by defaulting, e.g. `Number(value ?? 0)`, unless that behavior is part of the contract.
- Use `to*` names only for transformations. Use `get*` for message or label selection.
- Use function declarations for exported block-body helpers; expression-body arrows are fine for one-liners.
- Avoid single-letter and cryptic callback names.
- Keep named interfaces/types directly above the helper that uses them.
- Do not add trivial pass-through helpers that only reshape a couple fields once.
- Do not keep module helper files that only re-export a promoted shared util; update consumers to import the util directly.

## Common Decisions

- Extract when a function is more than 5 lines, reused, and easier to test or reason about outside the caller.
- Keep logic local when extraction would obscure a one-off flow.
- Promote to `src/shared/utils/` only when it is domain-agnostic and used by more than one module.
- Retry, backoff, and rate limiting belong to Effect `Schedule` in the adapter, not to ad hoc helpers.

## Verification

- Run `bun run typecheck`.
- Run `bun run check:fix`.
- Add focused specs for non-trivial parsing, transformation, or branching behavior.
