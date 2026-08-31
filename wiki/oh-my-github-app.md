# Oh My Github App

The public GitHub App is owned by the `AgentsLoop` organization and is available
at [Oh My Github App](https://github.com/apps/oh-my-github-app). It is installed
for all current and future repositories in `AgentsLoop`, and can be installed by
other users or organizations because the App is public.

The App has repository metadata read access and Issues read/write access. It
subscribes to the `Issues` and `Issue comment` events. Its configured webhook
endpoint is `https://omgithub.com/api/github/webhooks`.

The App also has Actions, Contents, and Pull requests read/write access so it
can dispatch workflows, create an OpenCode branch, and open the resulting pull
request in an installed repository. Existing installations must approve newly
requested permissions before those capabilities become active.

## Request routing

The webhook service verifies `X-Hub-Signature-256`, ignores bot-authored and
non-`OpenCode`-labeled issue events, and mints an installation-scoped token. It checks
`.github/workflows/opencode.yml` on the target repository's default branch:

- When the file exists, the App dispatches that repository-local wrapper.
- When the lookup returns 404, the App creates a thin repository-local wrapper
  that calls the centralized reusable workflow, then dispatches that wrapper.
  This keeps the Actions run and logs in the repository containing the `OpenCode`
  issue without copying the pipeline implementation.

Both routes call `.github/workflows/opencode-reusable.yml`. That reusable
workflow is the only copy of the OpenCode build, verification, remediation,
delivery, publishing, reporting, and cleanup pipeline. The local wrapper uses
the repository's `GITHUB_TOKEN`; installation credentials and tokens are never
carried in workflow inputs.

Keep the webhook secret out of the repository and this wiki.
