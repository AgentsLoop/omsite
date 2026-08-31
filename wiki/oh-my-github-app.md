# Oh My Github App

The public GitHub App is owned by the `AgentsLoop` organization and is available
at [Oh My Github App](https://github.com/apps/oh-my-github-app). It is installed
for all current and future repositories in `AgentsLoop`, and can be installed by
other users or organizations because the App is public.

The App has repository metadata read access and Issues read/write access. It
subscribes only to the `Issues` event. Its configured webhook endpoint is
`https://omgithub.com/api/github/webhooks`.

The App also has Actions, Contents, and Pull requests read/write access so it
can dispatch workflows, create an OpenCode branch, and open the resulting pull
request in an installed repository. Existing installations must approve newly
requested permissions before those capabilities become active.

## Request routing

The webhook service verifies `X-Hub-Signature-256`, ignores bot-authored and
non-`OpenCode`-labeled issue events, and mints an installation-scoped token. It
accepts only issue creation with `OpenCode` already present or addition of that
exact label; comments and edits never execute work. It checks
`.github/workflows/opencode.yml` on the target repository's default branch:

An optional first issue-body line `branch: <existing-branch>` selects the target
checkout and pull-request base. The App removes that metadata line from the
OpenCode prompt and validates the branch before routing. Invalid or nonexistent
branches receive an issue comment and stop before dispatch. The workflow
definition itself remains dispatched from the default branch, with the selected
branch forwarded through `target_ref`.

Before dispatching or bootstrapping a wrapper, the service verifies that the
installation token has Actions, Contents, Issues, Pull requests, and Workflows
write access. Missing permissions are posted to the triggering issue and the
request stops before an Actions run is created. If Issues write access itself is
missing, the service uses its configured notification token when that token can
access the repository.

- When the file handles `issues` events itself, the App leaves execution to that
  native trigger instead of creating a duplicate dispatch.
- When the file is a dispatch-only wrapper, the App dispatches it.
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
