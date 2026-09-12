import pathlib
import subprocess
import tempfile
import unittest

HOOK = pathlib.Path(__file__).resolve().parents[1] / 'scripts/vscode-project-args.sh'

class ProjectArgsTests(unittest.TestCase):
    def test_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp).resolve() / 'project with spaces'
            root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            file = root / 'ideas' / 'example.md'
            file.parent.mkdir()
            file.touch()
            other = pathlib.Path(tmp) / 'outside.txt'
            other.touch()
            cases = [
                (['--goto', str(file)], [str(root), '--goto', str(file)]),
                (['--goto', str(file)+':12:3'], [str(root), '--goto', str(file)+':12:3']),
                ([str(file)], [str(root), str(file)]),
                (['--goto', str(other)], ['--goto', str(other)]),
                ([str(root)], [str(root)]),
                (['--remote', 'ssh-remote+a2', '--goto', str(file)], None),
                (['--diff', str(file), str(other)], None),
                (['--version'], None),
                ([], None),
            ]
            for args, expected in cases:
                with self.subTest(args=args):
                    result = subprocess.run(['/bin/bash', '-c', 'source "$1"; shift; codex_project_args "$@"; printf "%s\\0" "${CODEX_PROJECT_ARGS[@]}"', 'test', str(HOOK), *args], capture_output=True, check=True)
                    actual = result.stdout.decode().split('\0')[:-1]
                    if not args: actual = [x for x in actual if x]
                    self.assertEqual(actual, args if expected is None else expected)

if __name__ == '__main__':
    unittest.main()
