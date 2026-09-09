# Oh My Github App

## Installation

Use the public [Oh My Github App](https://github.com/apps/oh-my-github-app).
Keep the webhook endpoint at `https://omgithub.com/api/github/webhooks` and
verify its signature. Grant Issues and Contents write access and Workflows
write access for listener installation. Retain Actions read access for run
verification and request claims.

Install `.github/workflows/opencode.yml` on the repository default branch
before applying `OpenCode`. Generate a wrapper that calls central preparation
and execution workflows at one resolved commit SHA. Preserve the local caller
in the central repository. Verify the installed content before creating an
App-submitted issue. Use `OMG_FALLBACK_OWNER`, `OMG_FALLBACK_REPO`, and
`OMG_FALLBACK_REF` to select the central revision.

## Request handling

Create human issues with mode labels first. Wait for listener installation,
then apply `OpenCode`. Use the native `issues.labeled` event for execution.
Let the App install the listener and post a reminder for unlabeled human issues.

Require a GitHub session and write, maintain, or admin repository access for
site submissions. Create the issue with an installation token. Store approval
for its exact title, body, label names, target branch, and authenticated human.
Apply mode labels before `OpenCode`.

Call `/api/opencode/prepare` with an Actions OIDC token that uses GitHub's
default repository-owner audience. Set repository variable `OMG_APP_ORIGIN`
when using another App origin. Verify the caller, Actions run, label event,
repository owner, and issue permissions.
Require the stored approval for App-created issues. Reject modified snapshots.
Keep approval and request claims in the persistent data store; use Firestore
transactions when configured. Preserve the data volume across service updates.

Resolve `branch: <existing-branch>` during preparation. Pass its frozen commit
as `target_sha` and branch name as `target_ref`. Keep workflow code on the
default branch. Pass only validated inputs to execution and keep model and
tunnel secrets out of preparation.

## Migration and retries

Pause submissions and drain active runs before replacing each listener.
Deploy the App service and install the native listener before resuming requests.
Keep one execution owner per repository during migration. Reapply `OpenCode`
only after the listener is ready and the request is authorized.

Use durable label-event claims to reject duplicate execution. Check the prior
Actions result before retrying a failed request. Treat removal and reapplication
of `OpenCode` as a new request and validate it again.

Keep the webhook secret, installation tokens, and model credentials private.
