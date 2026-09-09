---
name: omgithub-game-publisher
description: Find, inspect, and publish playable games to OmGithub from an arbitrary source link. Use when a user asks to extract games from a page, list, catalog, or repository and publish the verified games with metadata.
---

# OmGithub Game Publisher

Accept an arbitrary source URL. Inspect it, find game candidates, verify each game from its source code, and publish accepted games to OmGithub.

First fetch `https://omgithub.com/api/projects` once and build an index of published projects by repository and `public_path`. Do this before cloning, source inspection, GitHub API lookups, or a publish request. Treat a published root project on the repository's default path as a duplicate of the same root game on another branch unless the candidate identifies a distinct game directory or HTML entry. Keep distinct folders and HTML entries in a multi-game repository separate.

1. Read the supplied page, repository, list, catalog, or document. Extract candidate GitHub repositories, `tree` directories, and `blob` HTML files. Follow only links that can lead to source code for a browser-playable game.
2. Resolve collections into individual game source paths. Do not submit the collection page or a multi-game repository root as one game.
3. Compare every candidate with the published-project index. Skip an existing game before inspecting its source. Verify the existing store page, screenshot, and Play link only when the user requests a review or the existing project is known to have a problem.
4. Inspect each remaining candidate's README, package metadata, entry files, input handling, update loop, win or loss rules, and build configuration. Accept it only when the source implements player-controlled gameplay. Reject benchmarks, model comparisons, visual demos, scene viewers, editors, ordinary apps, websites, libraries, and duplicates.
5. Determine the exact publish target. Use one game directory or one standalone HTML entry. For a single-game repository, use its exact runnable root only after the code review proves that the repository contains one game.
6. Extract metadata from evidence. Include a factual title and description, one merged tags array, engine and model tags when the source supports them, and a private complexity score from 1 to 10. Record the supplied catalog, list, or discovery page URL as `source`. Do not replace it with the game repository URL.
7. Copy a creation prompt only when the source records it verbatim. Keep its source URL. Do not infer, paraphrase, or generate a missing prompt.
8. Inspect screenshots and runtime assets. Extract direct HTTPS image URLs from screenshot embeds and submit up to eight as `screenshot_embeddings`. If screenshots are absent, let the OmGithub build capture one. Do not submit a candidate with an unresolved entry point, missing local assets, or a known runtime failure.
9. Submit accepted games one at a time through the anonymous OmGithub manual publish request. Send the OmGithub origin header. Do not require or request GitHub sign-in. Include all extracted optional metadata. Wait for each submission to be accepted before sending the next one. Stop after the first failed submission and report the failure.
10. Verify the new store page, screenshot, and Play link. Remove the candidate from the accepted result if it does not run as a game.

Return a compact result with published games, skipped duplicates, rejected candidates with reasons, and failures. Never classify a link as a game only because it appears in a game list.
