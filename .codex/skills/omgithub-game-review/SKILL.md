---
name: omgithub-game-review
description: Review game candidates from GitHub lists, extract direct game links, and prepare evidence-backed OmGithub metadata. Use for manual curation; do not use for automatic publication.
---

# Omgithub Game Review

Review a supplied GitHub list before any OmGithub publication.

1. Extract only direct GitHub `tree` game-directory links or `blob` HTML-file links. Reject repository roots, list pages, catalog pages, and links that do not identify one playable source path.
2. Inspect the selected path and its nearby README, package metadata, and browser entry files. Classify it as a game only when the source has gameplay or player interaction. Reject benchmarks, model comparisons, visual demos, editors, websites, libraries, and scene viewers.
3. Build a review record for each accepted game. Include title, concise factual description, one merged tags array, engine evidence, model evidence, an optional exact prompt, prompt source URL, and the direct source link. Keep the complexity score private.
4. Copy a prompt only when the source records it verbatim. Do not infer or rewrite a prompt. Leave the prompt empty when evidence is absent.
5. Check screenshots and the selected entry point. Report missing screenshots or a likely build/runtime problem before submission.
6. Present accepted and rejected candidates with concrete evidence. Do not publish, install workflows, or send build requests unless the user separately asks to submit named accepted candidates.

When the user asks to submit, submit one reviewed direct source at a time with its optional metadata. Never bulk-submit a list.
