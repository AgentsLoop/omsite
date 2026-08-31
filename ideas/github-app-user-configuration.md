# GitHub App User Configuration

## Idea

Add a settings experience for the GitHub App so users can configure how OMG
responds to issues and pull requests without editing workflow files for every
repository.

GitHub should remain responsible for App installation and repository access.
The OMG service should host the configuration UI and store settings scoped to
the authenticated user, installation, organization, and repository.

## User flow

1. A user installs the GitHub App.
2. GitHub redirects the user to the App setup URL.
3. OMG verifies that the signed-in GitHub user owns or administers the
   installation; it must not trust an `installation_id` supplied only in the
   URL.
4. The user selects an organization and repositories to configure.
5. The user saves account defaults and optional organization/repository
   overrides.
6. When an issue triggers OMG, the webhook resolves the effective settings and
   dispatches the repository-owned Actions workflow with the approved values.

## Configuration precedence

Resolve settings from least specific to most specific:

```text
platform safety defaults
  -> user defaults
  -> organization settings
  -> repository settings
  -> safe per-request overrides
```

Per-user settings should act as defaults for that user's requests. They should
not silently override repository policy for other contributors. Organization
and repository settings require the corresponding GitHub administration or
write permission.

## Settings UI

The first version could provide:

- Enabled/disabled state per repository
- Default mode: web, game, Android, or review
- Approved model/provider selection
- Verification command, runtime command, and browser checks
- Public-preview and screenshot requirements
- Maximum retries, runtime, tokens, and cost
- Allowed branches and trigger labels
- Draft-versus-ready pull request behavior
- Notification preferences
- An audit log showing configuration changes and triggering installation

The UI should show the final effective configuration and identify where each
value came from, such as `repository`, `organization`, or `user default`.

## Repository configuration

Allow repositories to keep reviewable, non-secret overrides in a file such as
`.github/omg.yml`:

```yaml
verification:
  command: npm test
  runtime_command: npm run dev
  browser_checks: true
  public_preview: true
  max_retries: 3

limits:
  max_runtime_minutes: 45
  max_total_tokens: 100000
```

The dashboard configuration and repository file should be merged using the
same precedence rules. Invalid or unsafe values should fail closed and be
reported in the progress comment.

## Security boundaries

- Never trust `installation_id` from the setup URL without validating it
  against the authenticated user and GitHub installation metadata.
- Keep secrets in GitHub Secrets or the existing deployment secret store; do
  not write credentials to `.github/omg.yml` or workflow inputs.
- Restrict model/provider values to a server-side allowlist.
- Enforce maximum runtime, token, cost, retry, and concurrency limits on the
  server and in Actions.
- Keep workflow, deployment, and secret-related paths protected.
- Require human approval for risky changes and never auto-merge.
- Record installation and repository identity with every resolved run.

## Recommended architecture

```text
GitHub App setup/settings page
          |
          v
authenticated configuration service
          |
          +--> account / installation / repository settings store
          |
GitHub webhook -> resolve effective config -> repository-owned workflow
                                               |
                                               v
                                  OpenCode + verification + PR
```

GitHub Actions remains the execution plane. The App remains the control plane
for installation-scoped authentication, configuration resolution, webhook
routing, and workflow dispatch.

## MVP

Start with a hosted settings page for installation and repository settings,
support the verification and limit fields above, and make the effective
configuration visible in the run's progress comment. Add `.github/omg.yml`
support once the dashboard schema and precedence behavior are stable.

