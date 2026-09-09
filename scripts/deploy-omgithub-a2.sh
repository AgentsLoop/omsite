#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${OMGHITHUB_DEPLOY_HOST:-a2}"
DEST="${OMGHITHUB_DEPLOY_DIR:-/home/ubuntu/projects/omgithub}"

run_timed() {
  local label="$1"
  shift
  printf '\n[%s] start\n' "$label"
  if declare -F "$1" >/dev/null 2>&1; then
    # The external time command cannot invoke a shell function.
    time -p "$@"
  else
    /usr/bin/time -p "$@"
  fi
  printf '[%s] complete\n' "$label"
}

# shellcheck disable=SC2029 # Parse the command on a2.
stream_and_deploy() {
  local remote_dest remote_command

  # Keep custom deploy paths safe when the command is parsed on a2.
  printf -v remote_dest '%q' "$DEST"
  remote_command="set -e
DEST=$remote_dest
mkdir -p -- \"\$DEST\"
tar -xzf - -C \"\$DEST\"
cd \"\$DEST\"
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 BUILDKIT_PROGRESS=plain
sudo -n docker compose up -d --build --wait
sudo -n docker compose ps"

  env COPYFILE_DISABLE=1 LC_ALL=C tar --no-xattrs --no-mac-metadata -C "$ROOT" -czf - \
    --exclude=.git --exclude=node_modules --exclude=dist --exclude=data --exclude=.env . |
    ssh "$REMOTE" "$remote_command"
}

run_timed "stream archive and deploy" stream_and_deploy
