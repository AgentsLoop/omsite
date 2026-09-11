---
name: fix-agent-or-skill
description: Use when the user corrects agent behavior, says the agent misbehaved, or asks to preserve a correction in AGENTS.md or an existing SKILL.md.
---

# Fix Agent or Skill

Turn the user's latest correction into one durable, narrowly scoped instruction. Use the conversation as regression evidence. Do not change application code while applying this skill.

## Select the Target

- Update the governing `SKILL.md` when the failure happened while using a named or clearly applicable skill.
- Update the nearest project `AGENTS.md` when the correction applies only to that repository.
- Update the global `AGENTS.md` only when the user explicitly wants the behavior in all projects.
- Ask one concise question only when two targets remain equally valid after inspection.

## Apply the Correction

1. Read the active instruction files and the relevant skill before editing.
2. State the observed failure and the exact behavior that must replace it.
3. Edit the smallest authoritative file. Strengthen or replace an ambiguous rule instead of adding a duplicate.
4. Write direct, imperative English. Define the trigger, required action, and prohibited shortcut when each is necessary.
5. Preserve unrelated instructions, frontmatter, metadata, and user changes.
6. Do not generalize one correction beyond the scope stated by the user.

## Validate and Deliver

- Run `quick_validate.py` for every changed skill directory.
- Run `git diff --check` for every changed `AGENTS.md`.
- Inspect the final diff and confirm that it directly prevents the demonstrated failure.
- Follow the active repository instructions for committing and pushing. Stage only the corrected instruction or skill files.
- Report the changed file, the new rule, validation, and commit status.

## Stop Conditions

Stop without editing when the requested rule already exists and is unambiguous. Explain that the failure was noncompliance, not an instruction gap. Do not add repeated wording only to make the file appear changed.
