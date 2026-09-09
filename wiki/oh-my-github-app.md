# Oh My Github App

## Install the listener

Use the public [Oh My Github App](https://github.com/apps/oh-my-github-app)
as a repository setup helper. Handle installation creation and repositories
added to an installation. Verify webhook signatures at the setup service.

Grant Contents, Issues, and Workflows write access for setup. Create the
`OpenCode` label and install `.github/workflows/opencode.yml` on the default
branch. Pin central preparation and execution workflows to a resolved commit
SHA. Use `OMG_FALLBACK_OWNER`, `OMG_FALLBACK_REPO`, and `OMG_FALLBACK_REF`
to choose that revision. Keep repository workflow changes reviewable.

Install the generated caller manually when preferred. Configure the usual
model and optional tunnel secrets in the repository. Run preparation and
execution entirely through GitHub Actions after setup.

## Configure access

Set repository variable `OPENCODE_ACCESS` in Settings → Secrets and variables
→ Actions → Variables. Use `writers`, or leave it unset, to require repository
write, maintain, or admin access for the issue author.

Set it to `everyone` to accept any author. Let visitors create an issue titled
`/OpenCode Build a maze game`. Use the exact `/OpenCode` word in the title.
Let the workflow add `OpenCode` and execute within that opened-issue run.
Use ordinary execution-label requests in either access mode.

## Prepare and execute

Validate the request on the Actions runner with the repository token. Store
request records as GitHub Actions bot comments on the issue. Keep these
comments for duplicate detection and explicit failed-run retries.

Append `branch: <existing-branch>` to select project checkout. Freeze its
commit during preparation and use the branch as the result base. Load the
caller from the default branch and central workflow code from its pinned SHA.

Create site submissions with the signed-in user's GitHub token. Let the
repository's Actions access variable control execution.
