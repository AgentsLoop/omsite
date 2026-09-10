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

Run `npm test`, `npm run build`, and `git diff --check` before delivery.
Run `actionlint .github/workflows/omgithub-build.yml` after workflow changes.
Keep secrets in the deployment environment. Exclude `.env`, `data`, and dependencies from Git.
Add per-command timing when writing shell scripts.
Write Markdown as direct instructions in English.
Commit and push each completed code change. Record the reason, verification, and current Chat-ID in the commit body.
Include the relative age when reporting a commit.
