# Game catalog metadata and import plan

## Objective

Extend the OmGithub game catalog with searchable metadata and import the missing games from the supplied GitHub sources.

Preserve the existing immutable publication model. Keep repository paths and game paths as the preferred identity. Keep commit-based links only for backwards compatibility.

## Store metadata

Add these fields to every published game record:

- `prompt`: the prompt that created the game, when it is known.
- `prompt_source`: `github-file`, `github-list`, `issue`, `workflow`, or `manual`.
- `prompt_source_url`: the source URL for the prompt.
- `tags`: one normalized tag array. Combine existing GitHub repository topics with extracted gameplay, product, engine, and model tags. Examples include `fps`, `roguelike`, `platformer`, `game`, `app`, `website`, `three.js`, `godot`, `playcanvas`, `astra`, `opus`, and `fable`.
- `complexity_score`: an integer from 1 to 10.
- `metadata_source`: `opencode`, `github-list`, `manual`, or `import`.
- `metadata_updated_at`: an ISO timestamp.

Use one tag array only. Read GitHub repository topics, append validated extracted tags, lowercase, trim, deduplicate, and map aliases to canonical values. Keep the original extracted text in a private audit field when needed for review, but expose only the merged validated `tags` array in the public API.

## Extract metadata during the GitHub Action

Update the reusable OmGithub build workflow to perform metadata extraction after checkout and before the build upload.

1. Check the selected repository path and all relevant source files.
2. Find prompts in README files, issue text, prompt files, markdown lists, HTML comments, JSON data, and source metadata.
3. Ask OpenCode to classify the project and return strict JSON.
4. Ask OpenCode to identify the engine from dependencies, imports, configuration, and source usage.
5. Ask OpenCode to identify the model names only when the repository gives evidence. Do not infer a model from the visual style alone.
6. Ask OpenCode to assign tags and a complexity score from 1 to 10.
7. Read the GitHub repository topics. Concatenate them with the OpenCode tags, then validate, normalize, and deduplicate the one `tags` array.
8. Upload the validated metadata with the deployable ZIP to the OmGithub endpoint.
9. Store the metadata with the published project record.

Define the complexity score consistently:

- 1–2: one small page or single-file interaction.
- 3–4: simple game loop, basic input, and a small asset set.
- 5–6: multiple systems, scenes, enemies, levels, or persistence.
- 7–8: substantial simulation, 3D systems, procedural content, or many assets.
- 9–10: large multi-system project, advanced rendering, networking, or a broad application surface.

Require OpenCode to cite the files and lines that support the score and tags. Store those evidence references for admin review. Do not let a missing prompt prevent publication; publish with an empty prompt and mark metadata as incomplete.

## Prompt extraction and direct database import

Create a separate prompt-import command for prompt lists and catalog repositories.

1. Fetch each supplied list or catalog repository with the existing authenticated server-side GitHub cache.
2. Parse markdown links, tables, JSON data, issue references, and prompt files.
3. Resolve each prompt to an owner, repository, branch, path, and optional game path.
4. Deduplicate by canonical repository path and game path before writing.
5. Insert prompts directly into the project database when a matching published project exists.
6. Create a pending metadata record when the source game is not yet published.
7. Preserve the source URL and extraction timestamp.
8. Do not query GitHub again when the same source URL, commit, or repository path is already cached.

Use an idempotent upsert. Never create duplicate records for the same canonical path. Keep an import report with imported, updated, skipped, duplicate, and unresolved counts.

## Store page and Discovery UI

Add a metadata panel to each store page.

Display the prompt in a readable, collapsed section with a copy button. Show the merged tags and complexity score. Link each prompt source and evidence source when available.

Add the same tags and complexity score to the project card when space permits. Add filters for tag and complexity range after the metadata is available.

Keep Discovery sorting by cached GitHub stars and latest publication. Add metadata filtering without calling GitHub when the user changes a filter.

## Import the missing games

Import these direct game repositories. Resolve the default branch and publish the root game or the selected build path:

- `emollick/zork-underground-empire`
- `emollick/abyssal-living-deep`
- `petergpt/gogh-strike`
- `threapchills/MagicCarpetWizard`
- `IanOliverU/web-3d-game`
- `asmoyou/toy2game`
- `angxuejian/the-last-lawn`
- `marius4lui/NULLSPACE`
- `stackloomdev/last-beacon`
- `ToBeWin/vector-rush`
- `Ayi1337/gpt6-astra-one-shot-games`
- `cagrikacmaz/gpt-6-astra-vs-gemini-3-8-flash`
- `bitofastickler/one-prompt-two-worlds`
- `xinbenlv/ra2-gpt-6-astra-2026-09-04`
- `da03/astra-plays-gta`
- `gih10012/astra-parabox-benchmark`
- `finktheartist/bubble-wrap-simulator`
- `danmana/piata-unirii`
- `emollick/alexandria-mouseion`
- `Rising1234Sun/qingmingshanghetu`

Import these game directories from larger repositories:

- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/sunjing-puzzles`
- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/apex-club`
- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/thunderfall`
- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/mosswing`
- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/melon-lab`
- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/magic-carpet-wizard`
- `MartinDelophy/awesome-gpt-6-astra/tree/main/works/toy2game`

Inspect these repositories for additional game links and prompts:

- `majiayu000/astra-gallery`
- `yangqiong/gpt6-astra-3d`
- `olearydj/blog/tree/main/posts/2026-09-05-astra-demonstration-catalog`
- `MartinDelophy/awesome-gpt-6-astra`
- `xianyu110/awesome-gpt-6-astra`
- `TripoGrowthLab/awesome-astra-prompts`
- `magiccreator-ai/awesome-gpt-6-astra`
- `archorfight/awesome-gpt-6-astra`
- `hancengiz/gpt6astra.watch`
- `MiaAI-Lab/GPT-6-Astra-100-HTML-Files`
- `yangqiong/gpt6-astra-3d/tree/main/data`

Track these related sources for metadata or future import candidates:

- `SafaElmali/dualsense-controller`
- `EverettFish/holo-card-studio`
- `PhiloLabs/fable51-worlds`
- `alesha-pro/bench-portal`

## Duplicate and identity rules

Use this identity order:

1. Canonical owner, repository, and named path.
2. Canonical owner, repository, and selected HTML entry path.
3. Full commit SHA only for legacy records and old links.

Treat a game folder in a monorepo as distinct from the repository root. Treat repeated links to the same folder as duplicates. Treat a record with the same repository path but a newer commit as an update to the existing named project, not as a new discovery card.

## Delivery sequence

1. Define and validate the metadata schema.
2. Add workflow extraction and metadata upload.
3. Add server persistence, cache, and idempotent import endpoints.
4. Add prompt import and the initial source-list importer.
5. Add store-page metadata and prompt display.
6. Import the direct repositories and selected folders.
7. Scan catalog repositories for additional unique games and prompts.
8. Backfill metadata for existing published games.
9. Verify every imported game has a working play URL, valid `index.html`, screenshot status, source path, prompt status, and evidence-backed metadata.

## Acceptance criteria

- A published game displays its prompt, merged tags, and complexity score when evidence exists.
- The GitHub Action extracts metadata through OpenCode and uploads validated JSON with the build.
- Prompt-list imports write directly to the database through an idempotent operation.
- Re-running imports creates no duplicate games or prompts.
- Discovery filters and sorting use cached server data and do not call GitHub on interaction.
- All supplied direct repositories and selected game folders are checked, with unsupported or non-playable sources recorded in the import report.
- Every complexity score has file evidence and remains an integer from 1 to 10.
