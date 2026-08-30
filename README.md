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

- `GITHUB_TOKEN`: creates anonymous `/goal` issues and raises GitHub API limits.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`:
  authenticate signed App webhooks and mint installation-scoped tokens.
- `OMG_FALLBACK_OWNER`, `OMG_FALLBACK_REPO`, and `OMG_FALLBACK_REF`: identify
  the centralized reusable workflow used by bootstrapped repository wrappers.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: optional GitHub login.
- `FIREBASE_SERVICE_ACCOUNT_BASE64`: Firebase service-account JSON, base64 encoded.
- `PUBLISH_TOKEN`: bearer token shared with the Actions secret
  `OMGHITHUB_PUBLISH_TOKEN`.
- `PUBLIC_ORIGIN=https://omgithub.com`.

The webhook router validates `X-Hub-Signature-256`, ignores bot and non-`/omg`
events, and checks the target repository's default branch. A present local
workflow is dispatched with the installation token. A 404 creates a thin local
wrapper and dispatches it in the target repository; both routes call the same
central `opencode-reusable.yml` pipeline.

Deploy the Docker service to A1 with `../scripts/deploy-omgithub-a1.sh`. The
container publishes only to `127.0.0.1:8794`; host Caddy terminates TLS for
`omgithub.com` and `*.omgithub.com`.
