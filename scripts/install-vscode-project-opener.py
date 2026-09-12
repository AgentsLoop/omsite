#!/usr/bin/env python3
"""Install or remove the reversible, single-file Git-root CLI hook."""
import datetime
import pathlib
import shutil
import subprocess
import sys
import time

start = time.monotonic()
launcher = pathlib.Path('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code')
home = pathlib.Path.home() / '.local/share/vscode-project-opener'
hook = home / 'vscode-project-args.sh'
begin = '# BEGIN CODEX PROJECT OPENER\n'
end = '# END CODEX PROJECT OPENER\n'
text = launcher.read_text()
if begin in text:
    a = text.index(begin)
    b = text.index(end, a) + len(end)
    text = text[:a] + text[b:]
if '--uninstall' not in sys.argv:
    anchor = 'function app_realpath() {'
    if text.count(anchor) != 1:
        raise SystemExit('Unsupported VS Code launcher. Leave it unchanged.')
    home.mkdir(parents=True, exist_ok=True)
    shutil.copy2(launcher, home / ('code.backup.' + datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')))
    shutil.copy2(pathlib.Path(__file__).with_name('vscode-project-args.sh'), hook)
    import shlex
    block = begin + f'''if [ -f {shlex.quote(str(hook))} ]; then
    source {shlex.quote(str(hook))}
    codex_project_args "$@"
    set -- "${{CODEX_PROJECT_ARGS[@]}}"
fi
''' + end
    text = text.replace(anchor, block + anchor)
subprocess.run(['/bin/bash', '-n'], input=text, text=True, check=True)
launcher.write_text(text)
print(f"{'Removed' if '--uninstall' in sys.argv else 'Installed'} hook: {launcher} ({time.monotonic()-start:.3f}s)")
