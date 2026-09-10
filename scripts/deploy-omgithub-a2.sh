#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${OMGHITHUB_DEPLOY_HOST:-a2}"
DEST="${OMGHITHUB_DEPLOY_DIR:-/home/ubuntu/projects/omgithub}"
ARCHIVE_DIR=""
SSH_CONTROL_PATH=""

cleanup() {
  if [[ -n "$SSH_CONTROL_PATH" && -S "$SSH_CONTROL_PATH" ]]; then
    ssh -S "$SSH_CONTROL_PATH" -O exit "$REMOTE" >/dev/null 2>&1 || true
  fi
  if [[ -n "$ARCHIVE_DIR" ]]; then
    rm -f -- "$ARCHIVE_DIR/omgithub-deploy.tar.gz"
    rmdir "$ARCHIVE_DIR" 2>/dev/null || true
  fi
}

trap cleanup EXIT

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
  local remote_dest remote_archive remote_archive_quoted remote_command archive_path

  # Keep custom deploy paths safe when the command is parsed on a2.
  printf -v remote_dest '%q' "$DEST"
  ARCHIVE_DIR="$(mktemp -d)"
  archive_path="$ARCHIVE_DIR/omgithub-deploy.tar.gz"
  remote_archive="/tmp/omgithub-deploy-${ARCHIVE_DIR##*/}.tar.gz"
  printf -v remote_archive_quoted '%q' "$remote_archive"
  SSH_CONTROL_PATH="$ARCHIVE_DIR/ssh-control"

  run_timed "create deployment archive" env COPYFILE_DISABLE=1 LC_ALL=C tar --no-xattrs --no-mac-metadata -C "$ROOT" -czf "$archive_path" \
    --exclude=.git --exclude=node_modules --exclude=dist --exclude=data --exclude=.env .
  run_timed "connect to deployment host" ssh -M -S "$SSH_CONTROL_PATH" -fN "$REMOTE"
  run_timed "transfer deployment archive" ssh -S "$SSH_CONTROL_PATH" "$REMOTE" "cat > $remote_archive_quoted" < "$archive_path"

  remote_command="set -e
run_timed() {
  local label=\"\$1\"
  shift
  printf '\\n[%s] start\\n' \"\$label\"
  if declare -F \"\$1\" >/dev/null 2>&1; then
    time -p \"\$@\"
  else
    /usr/bin/time -p \"\$@\"
  fi
  printf '[%s] complete\\n' \"\$label\"
}
wait_for_services() {
  local container_id health deadline
  deadline=\$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    container_id=\"\$(sudo -n docker compose ps -q omgithub)\"
    if [[ -n \"\$container_id\" ]]; then
      health=\"\$(sudo -n docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \"\$container_id\")\"
      if [[ \"\$health\" == healthy || \"\$health\" == running ]]; then
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}
DEST=$remote_dest
ARCHIVE=$(printf '%q' "$remote_archive")
run_timed 'create deployment directory' mkdir -p -- \"\$DEST\"
run_timed 'extract deployment archive' tar -xzf \"\$ARCHIVE\" -C \"\$DEST\"
cd \"\$DEST\"
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 BUILDKIT_PROGRESS=plain
run_timed 'build service image' sudo -n docker compose build
run_timed 'start services' sudo -n docker compose up -d --no-build
run_timed 'wait for service health' wait_for_services
run_timed 'check service status' sudo -n docker compose ps
run_timed 'remove remote deployment archive' rm -f -- \"\$ARCHIVE\""

  ssh -S "$SSH_CONTROL_PATH" "$REMOTE" "$remote_command"
  run_timed "disconnect from deployment host" ssh -S "$SSH_CONTROL_PATH" -O exit "$REMOTE"
  SSH_CONTROL_PATH=""
}

stream_and_deploy
