# OmGithub publishing

The Vue/Node application lives in `site/`. Public project publication uses one
immutable route:

```text
https://omgithub.com/<owner>/<repo>/tree/<40-character-commit-sha>
```

Opening that route is the deployment trigger. OmGithub reads the public GitHub
repository and exact commit anonymously, downloads its archive, requires either
`dist/index.html` or root `index.html`, discovers committed
`screenshots/final-*` images, and materializes the playable files on an isolated
OmGithub subdomain. The route then displays the real project store page with
Play, Install, Share, source-commit, creator, and screenshot controls.

No visitor credential, repository secret, uploaded archive, or pre-created
project record is part of this publishing path. Private
repositories, branch names, abbreviated SHAs, oversized archives, and commits
without a browser entrypoint are rejected. Reopening the same immutable URL
uses the stored deployment keyed by `<owner>/<repo>@<sha>`.

Completed OpenCode issue comments contain this exact link:

```markdown
[Open Project](https://omgithub.com/<owner>/<repo>/tree/<commit-sha>)
```

Issue pages continue to poll GitHub comments for live OpenCode session,
temporary preview, and screenshot progress. When the completion link appears,
the issue workspace exposes an Open Project action to the immutable store page.

Production runs as the `omgithub` Docker Compose service on A1. Deploy with:

```sh
bash scripts/deploy-omgithub-a1.sh
```

The deployment streams the site archive through one SSH connection, uses the
existing A1 Docker layer cache through BuildKit, and waits for the Compose
healthcheck. The A1 Caddyfile routes both `omgithub.com` and
`*.omgithub.com` to `127.0.0.1:8794`; keep the wildcard DNS record proxied to
A1.

## GitHub App request routing

`POST /api/github/webhooks` validates the GitHub signature and normalizes
eligible `issues.opened` events that contain the exact `OpenCode` label and
`issues.labeled` events that add it. Comments, edits, bots, and other labels are
ignored. The service mints an installation-scoped token and checks
`.github/workflows/opencode.yml` on the selected branch. It dispatches an
existing dispatch-only wrapper or, on a confirmed 404, creates a thin wrapper
that calls the centralized `AgentsLoop/OhMyGithub` reusable workflow.

For a newly opened human issue without `OpenCode`, the service ensures the
repository label catalog contains `OpenCode`, posts a reminder, and stops.
Before dispatching or bootstrapping, it checks the installation's required
Actions, Contents, Issues, and Workflows write permissions.

The optional issue-title suffix `branch: <existing-branch>` selects the source
checkout. The App strips the suffix from the implementation request, validates
the branch, and dispatches the workflow from it. After verification, the
workflow pushes `opencode/<run-id>`, records the full commit SHA, and writes the
immutable OmGithub tree link into the completed issue comment.
