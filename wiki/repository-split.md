# Maintain the repository split

Use [omsite](https://github.com/AgentsLoop/omsite) for the website, GitHub App setup helper, publishing workflow, deployment script, and related product ideas.
Use [OhMyGithub](https://github.com/AgentsLoop/OhMyGithub) for standalone OpenCode execution.

Read the 80 imported commits with `git log`. Use `history/commit-map` to map original commits to filtered commits. Expect changed commit IDs because the split removes unrelated paths and promotes `site/` to the project root. Read the unchanged source history in OhMyGithub when full commit context is required.

Keep `OMG_FALLBACK_REPO=OhMyGithub` for App-installed execution workflows.
Set `OMGHITHUB_BUILD_OWNER=AgentsLoop` and `OMGHITHUB_BUILD_REPO=omsite` for publication builds. Grant the deployment GitHub token access to dispatch and read Actions runs in omsite.
Keep the existing production Compose project directory and data volume when deploying the split. Run `bash scripts/deploy-omgithub-a2.sh` from this project.

Keep the issue parser in `server/lib/issue-request.mjs` for App compatibility. Maintain the independent Actions parser in `scripts/issue-request.mjs` in OhMyGithub when changing the issue request format.
