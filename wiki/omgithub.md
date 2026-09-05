# OmGithub publishing

The Vue/Node application lives in `site/`. It mirrors GitHub routes at
`/<owner>/<repo>/issues/<number>` and `/<owner>/<repo>/pull/<number>`, polls
issue comments for OpenCode/trycloudflare/screenshot progress, and stores
published project ownership in Firebase.

The OpenCode workflow now publishes `project/dist` to the target repository's
`gh-pages` branch instead of uploading the build to `POST /api/publish`. Results
coexist below `branches/<sanitized-opencode-branch>/<commit-prefix>/`. The
workflow uses `peaceiris/actions-gh-pages` with `keep_files: true`, and defaults
to publishing unless `PAGES_PUBLISH_ENABLED=false`. After pushing the first
result, it assembles the complete `gh-pages` site and deploys it with GitHub's
Pages artifact/deployment actions, automatically provisioning the deployment.
Both built `dist/index.html` and static root `index.html` projects are
supported. If GitHub denies deployment, the final issue comment contains
direct Settings → Pages instructions. The legacy `/api/publish` endpoint and existing OmGithub-hosted records remain
available for compatibility, but new OpenCode workflow results do not use them.

Issue pages use the GitHub comments as their live data source. OpenCode chat is
embedded on the left; progress/final screenshots and the temporary or permanent
game preview occupy the right. The final report's `github.io` URL is detected as
the permanent published result.

The server also accepts `PUBLIC_ALIASES` (default `lolgames.net`) for the same
wildcard game handler; route that alias only after confirming its DNS ownership.

Production runs as the `omgithub` Docker Compose service on A1. Deploy with:

```sh
bash scripts/deploy-omgithub-a1.sh
```

The deployment streams the site archive through one SSH connection, uses the
existing A1 Docker layer cache through BuildKit, and waits for the Compose
healthcheck before reporting success. It does not leave a temporary archive on
A1.

The A1 Caddyfile must route both `omgithub.com` and `*.omgithub.com` to
`127.0.0.1:8794`. Keep the wildcard DNS record proxied to A1.

## GitHub App request routing

`POST /api/github/webhooks` validates the GitHub signature and normalizes
eligible `issues.opened` events that contain the exact `OpenCode` label and
`issues.labeled` events that add it. Comments, edits, bots, pull requests, and
other labels are ignored. The service mints an installation-scoped token and
checks `.github/workflows/opencode.yml` on the selected branch. It
dispatches dispatch-only wrappers and, on a confirmed 404, creates and dispatches
a thin local wrapper that calls the centralized
`AgentsLoop/OhMyGithub` reusable workflow.

For a newly opened human issue without `OpenCode`, the service ensures the
repository label catalog contains `OpenCode`, posts an actionable reminder to
add the label, and stops before workflow lookup or dispatch. Adding `OpenCode`
later is the supported retry.

Before dispatching or bootstrapping, it checks the installation's required write
permissions and comments on the triggering issue without starting an Actions run
when any are missing.

Before dispatch, the App creates or updates the `github-pages` environment and
allows the repository's actual default branch (`master`, `main`, or another
configured default) to deploy to it. This avoids GitHub rejecting the Pages
deployment before the reusable workflow can start.

If the App installation does not have repository environment-administration
permission, bootstrap treats Pages setup as optional: it dispatches the run with
Pages publishing disabled, so OpenCode execution and delivery can still finish.

The issue title may end with `branch: <existing-branch>`. The App strips the
suffix from the implementation request, validates the branch, and dispatches
the workflow from that branch. Repository-local workflows should remain
dispatch-only so one App event creates exactly one run.

The `test-gh` label is also an execution marker for the Pages-only smoke test.
It can be used without `OpenCode`; the reusable workflow skips OpenCode and
publishes a static Hello World fixture from a unique source branch.

The two workflow files have distinct roles: `opencode.yml` is a thin
dispatch-to-`uses:` wrapper, while `opencode-reusable.yml` owns the shared build,
verification, delivery, publishing, reporting, and cleanup pipeline. The
bootstrapped wrapper runs in the issue repository with its `GITHUB_TOKEN`;
never pass an installation token as a workflow input.
