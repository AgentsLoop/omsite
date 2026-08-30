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
eligible `issues` and `issue_comment` `/omg` events. The service mints an
installation-scoped token, checks `.github/workflows/opencode.yml` on the
target default branch, and dispatches that workflow when it exists. Only a
confirmed 404 takes the centralized `Issuefy/OhMyGithub` fallback route.

The two workflow files have distinct roles: `opencode.yml` handles local,
legacy, and centralized fallback entry events, while
`opencode-reusable.yml` owns the shared build,
verification, delivery, publishing, reporting, and cleanup pipeline. The
fallback reusable run mints its target token from `OMG_APP_ID` and
`OMG_APP_PRIVATE_KEY`; never pass an installation token as a workflow input.
