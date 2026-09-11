---
name: fix-agent-or-skill
description: Use when the user corrects agent behavior, says the agent misbehaved, or asks to preserve a correction in AGENTS.md or an existing SKILL.md.
---

# Fix Agent or Skill

Persist a user correction as a small, durable instruction. Use the correction and the observed failure as evidence. Do not change application code while applying this skill.

## Precedence

Resolve conflicts in this order:

1. Self-Improving Agent: capture direct user corrections and keep guidance specific and concise.
2. Codex Retrospective: require concrete evidence, avoid weak permanent rules, and prefer no change when evidence is insufficient.
3. This skill: select the narrowest target, validate the edit, and follow project delivery rules.

## Classify and Select

1. Read active `AGENTS.md` files and the relevant `SKILL.md` files.
2. Treat the user correction and observed failure as evidence. Do not infer a durable preference from an unrelated request.
3. Update `AGENTS.md` for a repository norm, guardrail, navigation fact, or project-specific behavior.
4. Update `SKILL.md` for a repeatable multi-step procedure with a clear result.
5. Keep corrections project-local by default. Update global instructions only when the user explicitly requests global behavior.
6. Stop when existing guidance already states the required behavior unambiguously. Report noncompliance instead of adding duplicate guidance.
7. Ask one concise question only when two targets remain equally valid after inspection.

## Apply

1. State the failure and the replacement behavior.
2. Edit the smallest authoritative file. Replace ambiguous wording instead of adding a duplicate rule.
3. Write every changed `SKILL.md` or `AGENTS.md` in a straightforward, extremely imperative style.
4. Define the trigger, required action, and prohibited shortcut when each is necessary.
5. Preserve unrelated instructions, frontmatter, metadata, and user changes.
6. Do not expand one correction beyond the scope stated by the user.
7. Prefer a deterministic test, validation, or hook when it can reliably enforce the correction. Explain that option before changing code or automation.

## Validate and Deliver

- Run `quick_validate.py` for every changed skill directory.
- Run `git diff --check` for every changed `AGENTS.md`.
- Re-read the final diff. Confirm that it prevents the demonstrated failure without unrelated guidance.
- Follow active repository instructions for commits and pushes. Stage only corrected instruction or skill files.
- Report the evidence, changed file, new rule, validation, and commit status.
