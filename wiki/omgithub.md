# OmGithub publishing

## Submit a game from the site

Select **Submit your game** in the header. Paste a public GitHub repository,
`tree` folder, or `blob` HTML file URL. Submit the form to open the game page
and follow build progress. Use this flow without signing in.

## Publish a public repository path

Use **Remix** on a published project card or project page to select its source repository in the composer. Keep the repository selector visible in the home composer. Validate cards, selectors, and modals in the dark theme at desktop and mobile widths before delivery. Deploy the verified build and check the live asset version when fixing missing production UI.

Use **Deploy** on a profile repository card to publish its root. Use **Open** after a successful root deployment. Keep subdirectory publications separate from the root deployment state. Show only public repositories.

Select **Remix** to choose a repository in the composer. Submit the prompt to reuse a writable repository or copy a public repository into your account. Select **Playground** to create or reuse `<logged-in-user>/PlayGround` with your GitHub token. Keep Playground public and enable Issues.

Select **New Project…** to enter a repository name in the modal. Create a public repository with an initial commit, select it automatically, and submit the prompt when ready. Correct duplicate names in the modal; do not rename them automatically. Install Git in the server runtime to support repository copies.

Open `https://omgithub.com/<owner>/<repo>` to publish the repository's default
branch. Open `https://omgithub.com/<owner>/<repo>/tree/<ref>/<path>` to publish
a named branch or tag and a game directory. Prefer these named paths in links
and store pages.

Open `https://omgithub.com/<owner>/<repo>/tree/<ref>/<path>` to publish a game
inside a repository. Resolve `<ref>` as a branch, tag, or commit SHA. Build
only `<path>`. For example, use
`https://omgithub.com/asmoyou/toy2game/tree/main/games/balance-astronaut`.

Open `https://omgithub.com/<owner>/<repo>/blob/<ref>/<file>` to publish one
HTML game file and its sibling assets. Build the file's directory, rename the
selected HTML file to `index.html`, and preserve the `blob` URL as the store
path. For example, use
`https://omgithub.com/Ayi1337/gpt6-astra-one-shot-games/blob/main/mosswing/mosswing.html`.

## Submit reviewed metadata

Review source code before publication. Submit one direct `tree` or `blob` link
with `POST /api/publish` from the OmGithub site. Do not require GitHub sign-in.
Set `build_runner` to `macos-latest` to build and capture a game on a GitHub-hosted
Mac. Use `ubuntu-latest` by default. Accept `mac-latest` as an alias. Set `refresh`
to `true` when recapturing an existing publication.
Require the OmGithub origin and validate the direct game source before starting
a build. Do not apply an IP-based publication limit. Send `source_url`
and optional `metadata`. Support `title`, `description`, `tags`, `prompt`,
`prompt_source_url`, `screenshot_embeddings`, and `source`. Send up to eight
HTTPS screenshot URLs in `screenshot_embeddings`. Show them in the screenshot
gallery. Store `source` as the catalog or awesome-list provenance URL. Never
return `source` through public project APIs or display it in the UI. Store a prompt only when its source URL identifies the
recorded prompt. Do not submit repository roots, list pages, or unreviewed
links. Do not bulk-submit a list.

Keep the source repository public. Supply no visitor credentials. Configure the
server's `GITHUB_TOKEN` to dispatch
[the build workflow](../.github/workflows/omgithub-build.yml).

Keep the project catalog and deployment files on the server. Check the named
repository path cache before calling GitHub. Reuse a cached published project
for every repeat visit and progress poll. Resolve a branch or tag only on the
first uncached visit. Keep the full commit-SHA route available only as a
backwards-compatible route.

Cache GitHub repository and commit metadata on disk. Reuse stale successful
responses when GitHub returns a rate-limit or temporary server error.

Run OpenCode in the trusted build workflow. Generate a factual description
when source metadata has none. Extract only prompts that match cited committed
text. When no recorded prompt exists, instruct OpenCode to reverse engineer an
actionable creation prompt from the game source. Describe implemented rules,
controls, mechanics, visuals, UI, and technical constraints. Cite implementation
lines and set `prompt_source` to `opencode-reconstructed`. Label reconstructed
prompts in the UI and link to the cited game source. Require a nonempty original
or reconstructed prompt from each new extraction. Retry invalid original-prompt
claims instead of silently dropping the prompt. Preserve existing recorded
prompts during publication; replace old reconstructed prompts with fresh
extraction results. Regenerate metadata to fill missing prompts on older games.
Merge OpenCode tags with GitHub repository topics. Store the evidence and
complexity score privately. Seed the public rating from complexity, then let
signed-in user ratings control the average as votes accumulate.

Generate `graphics_demand` with OpenCode during metadata extraction. Rate the
GPU requirement for typical gameplay at 1920 × 1080 as `light`, `moderate`,
`heavy`, `extreme`, `ultra`, or `godlike`. Store `level`, `source: "opencode"`,
and `assumptions`. Require source-line evidence for `graphics_demand`. Describe
the main GPU costs, scene load, and uncertainty in `assumptions`. Show the label
and assumptions on cards and game pages. Label the value as an OC estimate, not
a measured benchmark. Show “not rated” for old metadata. Regenerate metadata
through the publishing workflow to add ratings to existing games.

Count one play per project and visitor in a rolling 24-hour period. Let each
signed-in GitHub user keep one editable review and one editable rating per
project. Keep the rating when the user deletes only the comment.

Store `stargazers_count` as `github_stars` when publishing a project. Backfill
older catalog rows once with the authenticated migration command. Sort the
Discover cards from cached `github_stars` or `published_at` values. Do not call
GitHub when the user changes the sort control.

Let the workflow install dependencies, build the source, select `dist/`,
`build/`, the static root, or a selected HTML entry file, and capture a
screen capture when needed. If dependency installation or the normal build
fails, give OpenCode the immutable direct game URL and the temporary checkout.
Require OpenCode to diagnose the selected game, repair only the temporary
checkout, produce a deployable build, verify its local assets, and attempt a
real `screenshots/final-build.png` capture. Do not let OpenCode commit, push,
upload, or include unrelated sibling games. Run the deterministic workflow
screenshot step after recovery when OpenCode does not produce one. Upload the
deployable ZIP directly to `/api/builds`. Merge common static directories such
as `assets/`, `models/`, `textures/`, `images/`, `audio/`, and `media/` from
the selected source path into the build output so arbitrary Vite roots keep
their runtime files. Use the temporary upload token and
matching source headers. Give the headless capture up to thirty seconds for
asynchronous glTF and texture loading. Retain no GitHub Actions artifact.
Sign the short-lived upload token so a public request can finish on any
healthy OmGithub process. Continue to validate the source commit, selected
path, archive size, and `index.html` before publishing.

Require `index.html` in the deployment. Enforce the archive entry and size
limits in [public-project.mjs](../server/lib/public-project.mjs). Read the
replacement metadata before removing an existing deployment. Serve the
published files on their project subdomain.

Reuse a stored Actions deployment for later visits. Share concurrent
publication requests for the same named path and source commit within one
server process. Use one server process for the in-memory build registry.
Cache GitHub repository metadata on the server. Bypass that cache only while
polling the live Actions run created by the current publication request.

Set `OMGHITHUB_BUILD_ENABLED=false` only to publish committed browser files
directly. In that mode, provide `dist/index.html` or root `index.html` in the
commit and use committed `screenshots/final-*` images for the store page.

## Link from an issue

Prefer the repository path in the completed issue comment:

```markdown
[Open Project](https://omgithub.com/<owner>/<repo>/tree/<ref>/<path>)
```

Keep the full commit-SHA link working for old issue comments and old shared
links.

Poll issue comments for session links, preview links, screenshots, and the
completed project link. Cancel requests on navigation. Wait for each response
before scheduling the next poll.

Use [the GitHub App guide](oh-my-github-app.md) for issue labels, permissions,
branch selection, and dispatch routing. Use [the workflow guide](opencode.md)
for OpenCode execution and delivery.

## Configure and deploy

Use [the site setup guide](../README.md) for configuration. Deploy the
`omgithub` Docker Compose service to a2 with
`bash scripts/deploy-omgithub-a2.sh`. Route `omgithub.com` and
`*.omgithub.com` through host Caddy to `127.0.0.1:8794`.

Keep `DATA_DIR` on persistent storage for game files and caches. Configure
`SUPABASE_DB_URL` for the project catalog and social records. Follow
[the Supabase operations guide](supabase.md).

## Verify signed-out prompt recovery

Submit a prompt while signed out. Check the dark preparation modal and spinner for two seconds,
then check the redirect message before GitHub sign-in. Keep the prompt and selected
repository in tab-scoped session storage. Restore both in the home composer
after sign-in. Return to the starting path, query, and fragment after GitHub authentication. Require a new submit to start generation. Clear the saved draft
only after successful issue creation. Keep the prompt on screen if storage fails.
Use profile Remix actions to open the home composer with the repository selected.
Check the saved prompt preview, setup steps, and mobile modal layout. Use Escape
or the close button to cancel the redirect and return to the prompt.
