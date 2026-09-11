# OmSite agent instructions

Maintain the OmGithub website, publishing service, and GitHub App setup helper in this repository.
Keep OpenCode execution workflows in [OhMyGithub](https://github.com/AgentsLoop/OhMyGithub).
Use the App only to install repository listeners. Run issue preparation and execution in Actions.
Do not suggest, report, or propose security issues unless the user explicitly asks for a security review.

## Wiki index

- [Configure the site](README.md)
- [Configure the GitHub App](wiki/oh-my-github-app.md)
- [Publish projects](wiki/omgithub.md)
- [Operate Supabase](wiki/supabase.md)
- [Review the repository split](wiki/repository-split.md)

## Verify and deliver changes

Validate every new or changed UI in the dark theme at desktop and mobile widths. Inspect rendered cards, inputs, dropdowns, modals, and disabled states. Use dark surface tokens and readable text; reject unintended white panels. Check the deployed build when fixing live-site UI.

After each user-facing code change, commit and push the change, then deploy it to production. Spawn a `multi_agent_v1__spawn_agent` verifier with the Terra model after deployment. Require it to test the live site at desktop and mobile widths, capture screenshots, critique behavior and visual quality, and return an explicit pass or fail. Fix every failure, redeploy, and repeat verification until it passes.

Run `npm test`, `npm run build`, and `git diff --check` before delivery.
Run `actionlint .github/workflows/omgithub-build.yml` after workflow changes.
Keep secrets in the deployment environment. Exclude `.env`, `data`, and dependencies from Git.
Add per-command timing when writing shell scripts.
Write Markdown as direct instructions in English.
Commit and push each completed code change. Record the reason, verification, and current Chat-ID in the commit body.
Include the relative age when reporting a commit.

## Signed-in browser tests

Use the `phaneron23` GitHub account by default for signed-in browser tests.
Use a token from `gh auth` when a browser test requires a signed-in GitHub user.
Run `gh auth status` to confirm the account. Retrieve its token with `gh auth token --user phaneron23`.
Do not print, log, commit, or place the token in a user-visible URL.
Send the token only to OmGithub through the existing token sign-in route, then confirm the session with `/api/me` or the signed-in profile UI.
Use `?exec=logout` on the OmGithub home route to end the test session.
