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
  local remote_dest remote_command archive_path

  # Keep custom deploy paths safe when the command is parsed on a2.
  printf -v remote_dest '%q' "$DEST"
  remote_command="set -e
run_timed() {
  local label=\"\$1\"
  shift
  printf '\\n[%s] start\\n' \"\$label\"
  /usr/bin/time -p \"\$@\"
  printf '[%s] complete\\n' \"\$label\"
}
DEST=$remote_dest
run_timed 'create deployment directory' mkdir -p -- \"\$DEST\"
run_timed 'extract deployment archive' tar -xzf - -C \"\$DEST\"
cd \"\$DEST\"
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 BUILDKIT_PROGRESS=plain
run_timed 'build and start services' sudo -n docker compose up -d --build --wait
run_timed 'check service status' sudo -n docker compose ps"

  archive_path="$(mktemp -d)/omgithub-deploy.tar.gz"
  trap 'rm -f -- "$archive_path"; rmdir "${archive_path%/*}" 2>/dev/null || true' RETURN
  run_timed "create deployment archive" env COPYFILE_DISABLE=1 LC_ALL=C tar --no-xattrs --no-mac-metadata -C "$ROOT" -czf "$archive_path" \
    --exclude=.git --exclude=node_modules --exclude=dist --exclude=data --exclude=.env .
  run_timed "transfer and deploy archive" ssh "$REMOTE" "$remote_command" < "$archive_path"
}

run_timed "stream archive and deploy" stream_and_deploy
