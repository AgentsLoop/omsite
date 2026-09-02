#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${OMGHITHUB_DEPLOY_HOST:-ubuntu@100.127.77.25}"
DEST="${OMGHITHUB_DEPLOY_DIR:-/home/ubuntu/projects/omgithub}"
ARCHIVE="$(mktemp -t omgithub-site-XXXXXX.tar.gz)"
trap 'rm -f "$ARCHIVE"' EXIT

run_timed() {
  local label="$1"
  shift
  printf '\n[%s] start\n' "$label"
  /usr/bin/time -p "$@"
  printf '[%s] complete\n' "$label"
}

run_timed "create deployment archive" env COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C "$ROOT/site" -czf "$ARCHIVE" \
  --exclude=node_modules --exclude=dist --exclude=data --exclude=.env .
run_timed "create remote directory" ssh "$REMOTE" "mkdir -p '$DEST'"
run_timed "upload deployment archive" scp -q "$ARCHIVE" "$REMOTE:/tmp/omgithub-site.tar.gz"

run_timed "deploy remotely" ssh "$REMOTE" bash -s -- "$DEST" <<'REMOTE_SCRIPT'
set -euo pipefail
DEST="$1"

run_remote_timed() {
  local label="$1"
  shift
  printf '\n[remote:%s] start\n' "$label"
  /usr/bin/time -p "$@"
  printf '[remote:%s] complete\n' "$label"
}

run_remote_timed "extract archive" tar -xzf /tmp/omgithub-site.tar.gz -C "$DEST"
run_remote_timed "remove uploaded archive" rm -f /tmp/omgithub-site.tar.gz
cd "$DEST"
run_remote_timed "build and restart container" docker compose up -d --build
run_remote_timed "show container status" docker compose ps
REMOTE_SCRIPT
