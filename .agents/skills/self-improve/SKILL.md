---
name: self-improve
description: Use when the user corrects agent behavior and wants repo instructions, skills, prompts, or workflow rules updated so the mistake is less likely to happen again.
---

# Self Improve

Use this skill to turn a user correction into a narrow, durable instruction update.

## Flow

1. Identify each mistake, correction, or preference from the conversation.
2. Classify the affected area: a module (`ingest`, `ranking`, `profiles`, `share`), Effect/Schema, frontend, pipeline scripts, testing, git workflow, docs, or general agent behavior.
3. Read relevant existing skills in `.agents/skills`, `AGENTS.md` (`CLAUDE.md` is a symlink to it), `ARCHITECTURE.md`, and nearby rule docs before editing.
4. Decide whether each correction is a recurring rule, a one-off preference, or already covered.
5. For long correction threads, update every affected narrow skill in one pass instead of compressing all feedback into one generic rule.
6. Update the narrowest useful instruction surface.
7. Summarize what changed and why.

## Rules

- Do not add broad global rules for one-off incidents.
- Prefer updating a domain skill over `AGENTS.md` when the rule is domain-specific.
- Keep wording short, concrete, and agent-actionable.
- Do not write vague reminders such as "be careful"; include the trigger, the expected action, and the artifact to inspect or update.
- If a referenced helper skill is missing, say it is missing and continue with the closest available domain skill.
- Do not create commits, branches, GitHub comments, or discussions unless explicitly asked.
- Before editing any instruction or skill file, read at least 3 similar files.
