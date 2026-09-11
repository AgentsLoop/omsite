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

After each user-facing code change, commit and push the change, then spawn a `collaboration.spawn_agent` delivery verifier with model `gpt-5.6-terra`. Require it to run the required build and checks, deploy the change to production, test the live site at desktop and mobile widths, capture screenshots, critique behavior and visual quality, and return an explicit pass or fail. Fix every failure, commit and push the fix, then repeat the agent-run build, deployment, and verification until it passes.

Spawn the verifier with this pattern:

```text
collaboration.spawn_agent({
  "task_name": "build_deploy_verify_production",
  "model": "gpt-5.6-terra",
  "fork_turns": "3",
  "message": "Run the required build and checks. Deploy the change to production. Test the live site at desktop and mobile widths. Exercise the changed behavior, capture screenshots, critique the dark theme and visual quality, and return an explicit PASS or FAIL with defects."
})
```

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
