---
name: conventional-commit
description: Use when the user explicitly asks to create a commit or generate a Conventional Commit from current repository changes.
---

# Conventional Commit

Use this skill only when the user explicitly asks to commit.

## Flow

1. Inspect `git status`.
2. Inspect staged and unstaged diffs for the intended scope.
3. Compare the diff with user intent and avoid unrelated user changes.
4. Stage only intended files when staging is needed.
5. Create a concise Conventional Commit message.
6. Commit.

## Message Rules

- Use `type(scope): subject` when a clear scope exists.
- Use imperative mood.
- Keep the subject concise.
- Add a body only when the change needs context, tradeoffs, or migration notes.
- Use a breaking change footer only for actual breaking changes.
- Use module names as scopes when the change sits in one module: `ingest`, `ranking`, `profiles`, `share`, `shared`, `scripts`.
- commitlint (`@commitlint/config-conventional`) checks the message in the `commit-msg` hook; fix the message instead of bypassing the hook.
- Never add `Co-Authored-By` lines or any AI or tool attribution.

## Safety Rules

- Never commit unless the user explicitly asked.
- Never include unrelated changes.
- Prefer small scoped commits when the diff contains multiple logical changes.
- Do not create branches, GitHub comments, or discussions unless explicitly asked.
- Never use `--no-verify`; if the `pre-commit` hook (`ultracite fix` on staged files) changes files, review and stage them.
