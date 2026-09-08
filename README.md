# OmGithub site

Use the Vue frontend and Node service to create issues, display OpenCode
progress, publish public commits, and serve project subdomains.

## Local development

Install dependencies from `site/`. Copy `.env.example` to `.env`, set the
required values, and load them into the server environment before starting
development. Use `PUBLIC_ORIGIN=http://localhost:5173` for local OAuth
redirects through the Vite proxy.

```sh
npm install
npm run dev
```

Build the frontend with `npm run build` before using `npm start` to serve the
production frontend.

The Discover section supports `Latest` and `GitHub stars` sorting. Read both
values from the server-side project catalog. Backfill existing rows with
`npm run backfill:github-stars` inside the production container after setting
the authenticated `GITHUB_TOKEN`.

## Configuration

- Set `GITHUB_TOKEN` for public repository builds and reads.
- Require GitHub login and repository write access for issue submission. Apply
  execution labels with the App installation token after storing approval.
- Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`
  to authenticate App webhooks and installation requests.
- Set `OMG_FALLBACK_OWNER`, `OMG_FALLBACK_REPO`, and `OMG_FALLBACK_REF` to
  select the central reusable workflow for repository wrappers.
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to enable GitHub login.
- Set a stable `SESSION_SECRET`. Expect a server restart to end sessions;
  keep one server process for the in-memory session and build registries.
- Set `FIREBASE_SERVICE_ACCOUNT_BASE64` or `FIREBASE_SERVICE_ACCOUNT_JSON`
  to use Firebase. Persist execution approvals and claims there too. Otherwise,
  keep the local catalog and `opencode-executions/` under persistent `DATA_DIR`.
- Set repository variable `OMG_APP_ORIGIN` when the preparation endpoint uses
  a different HTTPS origin. Match its OIDC audience to `/api/opencode/prepare`.
- Set `PUBLIC_ORIGIN=https://omgithub.com` in production. Set
  `PUBLIC_ALIASES` to a comma-separated list of additional public domains.
- Set `OMGHITHUB_BUILD_OWNER`, `OMGHITHUB_BUILD_REPO`,
  `OMGHITHUB_BUILD_WORKFLOW`, and `OMGHITHUB_BUILD_REF` to override the build
  workflow defaults. Use the existing `OMGHITHUB_` spelling for these keys.
- Set `OMGHITHUB_BUILD_ENABLED=false` to publish committed browser files
  directly during local inspection.

Use [the publishing guide](../wiki/omgithub.md) for immutable routes, build
uploads, deployment limits, and hosting. Use [the GitHub App guide](../wiki/oh-my-github-app.md)
for event routing, required permissions, and branch selection.

Open `/owner/repo/tree/ref/path` to publish a game from a repository
subdirectory. OmGithub resolves the branch or tag, builds that directory, and
publishes its `dist/`, `build/`, or static root. Open
`/owner/repo/blob/ref/path/game.html` to publish a selected HTML entry file;
OmGithub renames that file to `index.html` and preserves sibling assets. For
example, open
`/Ayi1337/gpt6-astra-one-shot-games/blob/main/mosswing/mosswing.html`.

Deploy to A1 with `../scripts/deploy-omgithub-a1.sh`. Bind the container to
`127.0.0.1:8794` and terminate TLS through host Caddy.
