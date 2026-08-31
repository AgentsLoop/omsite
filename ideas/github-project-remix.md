# Remix GitHub projects from user profiles

When viewing a user profile, show both their published OmGithub projects and their actual GitHub repositories.

Each GitHub repository should have a **Remix** action. Clicking Remix opens the main creation screen with that repository selected as the project context and the prompt composer ready for a new request.

## Remix behavior

- If the selected repository belongs to another user, clone it into a new repository owned by the logged-in user.
- If the selected repository already belongs to the logged-in user, reuse the existing repository.
- Install or update the OmGithub workflow files in the target repository.
- Run the workflow with the prompt entered by the user, creating the corresponding GitHub issue.
- Keep the selected repository, clone/target repository, issue, workflow run, and resulting published project linked together in the UI.

## User experience

- Profile pages distinguish published projects from available GitHub repositories.
- Remix preserves the repository context while the user edits the prompt.
- Before running, show the target repository and whether it will be cloned or reused.
- After submission, show the issue and workflow progress using the same live build view as a new project.
