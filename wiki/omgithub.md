# OmGithub publishing

The Vue/Node application lives in `site/`. It mirrors GitHub routes at
`/<owner>/<repo>/issues/<number>` and `/<owner>/<repo>/pull/<number>`, polls
issue comments for OpenCode/trycloudflare/screenshot progress, and stores
published project ownership in Firebase.

The OpenCode workflow uploads `project/dist` to `POST
https://omgithub.com/api/publish` after creating the PR. Authentication uses the
`OMGHITHUB_PUBLISH_TOKEN` Actions secret. The service reuses a slug when the
same issue/PR is republished; a collision from another project gets `-2`, `-3`,
and so on. Published games use `https://<slug>.omgithub.com/`, with the install
page at `/install`.

The server also accepts `PUBLIC_ALIASES` (default `lolgames.net`) for the same
wildcard game handler; route that alias only after confirming its DNS ownership.

Production runs as the `omgithub` Docker Compose service on A1. Deploy with:

```sh
bash scripts/deploy-omgithub-a1.sh
```

The A1 Caddyfile must route both `omgithub.com` and `*.omgithub.com` to
`127.0.0.1:8794`. Keep the wildcard DNS record proxied to A1.

## GitHub App request routing

`POST /api/github/webhooks` validates the GitHub signature and normalizes
eligible `issues.opened` events that contain the exact `OpenCode` label and
`issues.labeled` events that add it. Comments, edits, bots, pull requests, and
other labels are ignored. The service mints an installation-scoped token and
checks `.github/workflows/opencode.yml` on the target default branch. It
dispatches dispatch-only wrappers and, on a confirmed 404, creates and dispatches
a thin local wrapper that calls the centralized
`AgentsLoop/OhMyGithub` reusable workflow.

Before dispatching or bootstrapping, it checks the installation's required write
permissions and comments on the triggering issue without starting an Actions run
when any are missing.

The first issue-body line may be `branch: <existing-branch>`. The App strips the
directive from the implementation request, validates the branch, and forwards
it as `target_ref`. Repository-local workflows should remain dispatch-only so
one App event creates exactly one run.

The two workflow files have distinct roles: `opencode.yml` is a thin
dispatch-to-`uses:` wrapper, while `opencode-reusable.yml` owns the shared build,
verification, delivery, publishing, reporting, and cleanup pipeline. The
bootstrapped wrapper runs in the issue repository with its `GITHUB_TOKEN`;
never pass an installation token as a workflow input.
