# Open Codex files in their Git project

Use Codex's **Open in VS Code** menu after installing the launcher hook.
Expect single local file opens to include their Git root. Preserve the original
file path and line/column arguments. Leave non-Git files, directories, remote
commands, and multi-file commands unchanged. Do not force the last active window.

## Install

Run `python3 /Users/igor/Documents/ChatGPT/omsite/scripts/install-vscode-project-opener.py`.
Run `python3 /Users/igor/Documents/ChatGPT/omsite/tests/test_vscode_project_args.py`.
Repeat installation after a VS Code update replaces the launcher.

Expect the installed ChatGPT app's local VS Code integration to invoke
`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code --goto FILE`
directly. Inspect `.vite/build/main-BOrkpaTV.js` inside the installed app's
`app.asar` to verify this build's `darwinDetect`, `Nj`, and `Bj` implementations.
Do not use `.zshrc` aliases to intercept this absolute executable path.

Keep the hook in `/Users/igor/.local/share/vscode-project-opener/`.
Keep timestamped launcher backups there. Account for the modified app-bundle
file when checking VS Code's code signature or reinstalling VS Code.
Use Git's top-level directory, including the current worktree root; do not
substitute the main checkout for a worktree file.

## Remove

Run `python3 /Users/igor/Documents/ChatGPT/omsite/scripts/install-vscode-project-opener.py --uninstall`.
Remove only the marked hook block. Preserve unrelated launcher changes.

## Consider extensions

Compare [Always Open Workspace](https://marketplace.visualstudio.com/items?itemName=Hai.AlwaysOpenWorkspace)
if modifying the launcher is unsuitable. Expect it to add project roots to the
current workspace rather than select a dedicated project window. Do not enable
its automatic folder removal unless that behavior is wanted.

## Verify manually

Click **Open in VS Code** on a file in this repository. Confirm the Explorer
root is `omsite`. Repeat with a file link that includes a line number. Confirm
that an unrelated open project is not replaced. Do not treat argument tests as
proof of the final graphical window selection.
