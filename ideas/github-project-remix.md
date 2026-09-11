# Remix GitHub projects from user profiles

Show published projects and public GitHub repositories on profile pages. Exclude private repositories from profile and composer responses. Reject private generation and deployment requests.

Use one composer on home and profile pages. Select a repository with **Remix**, scroll to the composer, and focus the prompt. Wait for generation submission before copying repositories or opening issues. Create or reuse `<logged-in-user>/PlayGround` with the user's token when no repository is selected. Require sign-in and record the requesting user in the issue body.

Add **New Project…** to the selector. Open a modal for the repository name. Create a public repository with an initial commit and Issues enabled when the user selects **Create**. Keep name conflicts visible in the modal. Select the new repository and focus the prompt after creation. Wait for prompt submission before installing the workflow and starting generation. Reject private or unusable existing Playground repositories without changing their settings.

## Remix behavior

- Copy a non-writable public repository into the signed-in user's account. Preserve branches, tags, and history. Add a numbered suffix when the name exists. Keep the copy public.
- Reuse a selected writable public repository.
- Install or update the OmGithub workflow files in the target repository.
- Run the workflow with the prompt entered by the user, creating the corresponding GitHub issue.
- Keep the selected repository, clone/target repository, issue, workflow run, and resulting published project linked together in the UI.

## User experience

- Profile pages distinguish published projects from available GitHub repositories.
- Preserve the repository selection while the user edits the prompt.
- Before running, show the target repository and whether it will be cloned or reused.
- After submission, show the issue and workflow progress using the same live build view as a new project.

## Deploy repositories

Show **Open** for the newest successful root deployment. Show **Deploy** otherwise. Ignore subdirectory deployments when setting this action. Start deployment through the same-origin POST endpoint and show the existing progress page.

Keep Git installed in the server runtime. Remove temporary checkouts after success or failure. Keep a newly created GitHub repository available when copying fails and report the target name.
