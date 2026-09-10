# OmGithub site

Use the Vue frontend and Node service to create issues, display OpenCode
progress, publish public commits, and serve project subdomains.

## Local development

Install dependencies from the project root. Copy `.env.example` to `.env`, set the
required values, and load them into the server environment before starting
development. Use `PUBLIC_ORIGIN=http://localhost:5173` for local OAuth
redirects through the Vite proxy.

```sh
npm install
npm run dev
```

Build the frontend with `npm run build` before using `npm start` to serve the
production frontend.

## Project layout

- Keep Vue pages and components in `src/`.
- Keep the HTTP entry point at `server/index.mjs`.
- Keep reusable server modules in `server/lib/`.
- Keep maintenance commands in `server/cli/`.
- Keep server tests in `server/tests/`.
- Keep reviewed command input in `config/`.
- Keep deployment and metadata extraction commands in `scripts/`.
- Keep operational documentation in `wiki/` and design proposals in `ideas/`.

Publish repository builds with catalog metadata. Configure `OPENCODE_API_KEY`
or `OPENCODE_AUTH_JSON` in GitHub Actions. Let the workflow extract one merged
tag list, an evidence-backed description, an exact recorded prompt when one
exists, and a private complexity score. Display the prompt, tags, public
rating, review count, comments, and deduplicated play count on the store page.

Scan only a reviewed manifest of direct GitHub `tree` directories or `blob`
HTML files before importing games. Do not add repository roots, catalog pages,
or lists to this manifest. Use the scanner only to prepare a review report.

```sh
GITHUB_TOKEN=... npm run catalog:scan
```

Review source code before any submission. Do not use the importer to submit games.
Submit the exact reviewed game directory or HTML file manually in OmGithub. Run
`npm run catalog:prompts` with Supabase
database credentials to apply exact prompts to matching published project records.
Reuse the report and disk cache when a run is interrupted.

The Discover section supports `Latest` and `GitHub stars` sorting. Read both
values from the server-side project catalog. Backfill existing rows with
`npm run backfill:github-stars` inside the production container after setting
the authenticated `GITHUB_TOKEN`.

## Configuration

- Set `GITHUB_TOKEN` for public repository builds and reads.
- Require GitHub login for site issue submission. Create issues with the user's
  GitHub token and `/OpenCode` in the title. Request labels through GitHub.
- Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`
  to install listeners through installation webhooks.
- Set `OMG_FALLBACK_OWNER`, `OMG_FALLBACK_REPO`, and `OMG_FALLBACK_REF` to
  select the central reusable workflow for repository wrappers.
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to enable GitHub login.
- Request the `read:user repo workflow` OAuth scopes. Use them to list private repositories and install the OpenCode workflow during a remix.
- Open `https://omgithub.com/?token=GITHUB_TOKEN` to create a session from an
  existing GitHub token. Let the server validate the token and redirect to a
  clean profile URL. Do not share or bookmark the token URL.
- Set a stable `SESSION_SECRET`. Expect a server restart to end sessions;
  keep one server process for the in-memory session and build registries.
- Set `SUPABASE_DB_URL` to the server-side PostgreSQL connection string.
  Require it in production. Use local JSON storage only for development.
  Follow [the Supabase operations guide](wiki/supabase.md).
- Set repository variable `OPENCODE_ACCESS=everyone` to let any issue author
  execute a labeled request or open an issue with `/OpenCode` in its title.
  Leave it unset to require repository write, maintain, or admin access.
- Set `PUBLIC_ORIGIN=https://omgithub.com` in production. Set
  `PUBLIC_ALIASES` to a comma-separated list of additional public domains.
- Set `OMGHITHUB_BUILD_OWNER`, `OMGHITHUB_BUILD_REPO`,
  `OMGHITHUB_BUILD_WORKFLOW`, and `OMGHITHUB_BUILD_REF` to override the build
  workflow defaults. Use the existing `OMGHITHUB_` spelling for these keys.
- Set `OMGHITHUB_BUILD_ENABLED=false` to publish committed browser files
  directly during local inspection.

Use [the publishing guide](wiki/omgithub.md) for immutable routes, build
uploads, deployment limits, and hosting. Use [the GitHub App guide](wiki/oh-my-github-app.md)
for event routing, required permissions, and branch selection.

Open `/owner/repo/tree/ref/path` to publish a game from a repository
subdirectory. OmGithub resolves the branch or tag, builds that directory, and
publishes its `dist/`, `build/`, or static root. Open
`/owner/repo/blob/ref/path/game.html` to publish a selected HTML entry file;
OmGithub renames that file to `index.html` and preserves sibling assets. For
example, open
`/Ayi1337/gpt6-astra-one-shot-games/blob/main/mosswing/mosswing.html`.

Deploy to a2 with `bash scripts/deploy-omgithub-a2.sh`. Bind the container to
`127.0.0.1:8794` and terminate TLS through host Caddy.
