# OmGithub publishing

## Publish a public repository path

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

Keep the source repository public. Supply no visitor credentials. Configure the
server's `GITHUB_TOKEN` to dispatch
[the build workflow](../.github/workflows/omgithub-build.yml).

Keep the project catalog and deployment files on the server. Check the named
repository path cache before calling GitHub. Reuse a cached published project
for every repeat visit and progress poll. Resolve a branch or tag only on the
first uncached visit. Keep the full commit-SHA route available only as a
backwards-compatible route.

Store `stargazers_count` as `github_stars` when publishing a project. Backfill
older catalog rows once with the authenticated migration command. Sort the
Discover cards from cached `github_stars` or `published_at` values. Do not call
GitHub when the user changes the sort control.

Let the workflow install dependencies, build the source, select `dist/`,
`build/`, the static root, or a selected HTML entry file, and capture a
screenshot when needed. Upload the
deployable ZIP directly to `/api/builds` with the temporary upload token and
matching source headers. Retain no GitHub Actions artifact.

Require `index.html` in the deployment. Enforce the archive entry and size
limits in [public-project.mjs](../site/server/public-project.mjs). Read the
replacement metadata before removing an existing deployment. Serve the
published files on their project subdomain.

Reuse a stored Actions deployment for later visits. Share concurrent
publication requests for the same named path and source commit within one
server process. Use one server process for the in-memory build registry.

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

Use [the site setup guide](../site/README.md) for configuration. Deploy the
`omgithub` Docker Compose service to A1 with
`bash scripts/deploy-omgithub-a1.sh`. Route `omgithub.com` and
`*.omgithub.com` through host Caddy to `127.0.0.1:8794`.

Keep `DATA_DIR` on persistent storage. Configure Firebase for the project
catalog, or use the local `projects.json` fallback. Replace the local catalog
through a temporary file to avoid truncating the active file during a write.
