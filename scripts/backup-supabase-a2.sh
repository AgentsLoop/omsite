#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir="${SUPABASE_BACKUP_DIR:-/home/ubuntu/backups/supabase}"
run_timed() { /usr/bin/time -p "$@"; }
run_timed mkdir -p "$backup_dir"
backup_file="$backup_dir/postgres-$(date -u +%Y%m%dT%H%M%SZ).dump"
run_timed docker exec supabase-db pg_dump -U postgres -Fc postgres > "$backup_file.tmp"
run_timed mv "$backup_file.tmp" "$backup_file"
run_timed chmod 600 "$backup_file"
