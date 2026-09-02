# OmGithub site

Vue creator/store frontend plus a Node service that mirrors GitHub issue and
pull-request routes, tracks OpenCode workflow progress, stores project metadata
in Firebase, and hosts published game ZIPs on wildcard subdomains.

## Local development

```sh
cp .env.example .env
npm install
npm run dev
```

The production server serves `dist/`, so run `npm run build && npm start` for a
production-mode local check.

## Required production configuration

- `GITHUB_TOKEN`: applies the `Goal` and `OpenCode` labels to Site-created
  issues and raises GitHub API limits.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`:
  authenticate signed App webhooks and mint installation-scoped tokens.
- `OMG_FALLBACK_OWNER`, `OMG_FALLBACK_REPO`, and `OMG_FALLBACK_REF`: identify
  the centralized reusable workflow used by bootstrapped repository wrappers.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: optional GitHub login.
- `FIREBASE_SERVICE_ACCOUNT_BASE64`: Firebase service-account JSON, base64 encoded.
- `PUBLIC_ORIGIN=https://omgithub.com`.

Publishing authenticates with the workflow's automatically generated
repository-scoped `GITHUB_TOKEN`; no publishing secret is required.

The webhook router validates `X-Hub-Signature-256` and accepts only non-bot
`issues.opened` events that already contain the exact `OpenCode` label, or
`issues.labeled` events that add that label.
Comments, edits, and other labels do not execute the workflow. A newly opened
human issue without `OpenCode` receives a reminder, and the App ensures the
label exists in the repository label catalog without applying it to the issue.
Adding `OpenCode` later starts the workflow. The repository-local workflow is dispatch-only
and is dispatched with the installation token. A 404 creates a thin local
wrapper and dispatches it in the target repository; both dispatch routes call
the same central `opencode-reusable.yml` pipeline.

An optional issue-title suffix `branch: <existing-branch>` selects the target
checkout and pull-request base. The router removes the suffix from the request,
verifies that the branch exists, and dispatches the workflow from that branch.
Invalid branches are reported on the issue without starting an Actions run.

Before dispatch or bootstrap, the router checks that the installation token grants
Actions, Contents, Issues, and Workflows write access. If any are
missing, it posts the missing permissions to the triggering issue and does not
start an Actions run. When Site issue creation cannot apply its required labels,
it leaves the issue with the same actionable warning instead of starting work.

Deploy the Docker service to A1 with `../scripts/deploy-omgithub-a1.sh`. The
container publishes only to `127.0.0.1:8794`; host Caddy terminates TLS for
`omgithub.com` and `*.omgithub.com`.
