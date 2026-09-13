# Oh My Github App

## Install the listener

Use the public [Oh My Github App](https://github.com/apps/oh-my-github-app)
as a repository setup helper. Subscribe to issue events. Verify webhook
signatures at the setup service. Do not modify a repository when the App is
installed or when a repository is added to an installation.

Grant Actions, Contents, Issues, and Workflows write access. Install
`.github/workflows/opencode.yml` on the default branch when an issue opens with
an `OpenCode` label or a `/OpenCode` title. Ignore all other issues. Pin central preparation and
execution workflows to a resolved commit SHA. Use `OMG_FALLBACK_OWNER`,
`OMG_FALLBACK_REPO`, and `OMG_FALLBACK_REF` to choose that revision. Keep
repository workflow changes reviewable.

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
Attach the execution label when creating the issue in either access mode.

## Prepare and execute

Validate author access and resolve the target branch on the Actions runner.
Use one `issues.opened` run per issue. Serialize jobs with Actions concurrency.
When `branch:` selects another branch, dispatch the caller at that branch and
stop the default-branch run. Run preparation and OpenCode in the dispatched run.
Create a new issue with the same title and body when retrying a failed request.
Attach the original execution and requested mode labels. Keep status labels out of the new issue.

Append `branch: <existing-branch>` to select project checkout. Freeze its
commit during preparation and use the branch as the result base. Load the
initial listener from the default branch. Load the execution caller from the
selected branch and central workflow code from the revision that caller pins.

Create site submissions with the signed-in user's GitHub token. Let the
repository's Actions access variable control execution.

## Select build resources

Use **Files**, screenshot tabs, and **Final Game** in the issue preview.
Keep the file-index URL separate from the verified app URL. Advance the default
selection when a newer build stage arrives. Use **View branch** to open the result source.
