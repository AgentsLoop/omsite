# Operate Supabase on A2

Use SSH alias `a2`. Run the Supabase Compose stack from
`/home/ubuntu/projects/supabase`. Keep release `self-hosted/v0.8.1` pinned.
Follow the [official Docker guide](https://supabase.com/docs/guides/self-hosting/docker)
before upgrading.

Open https://supabase.omgithub.com for Studio. Read the dashboard credentials
and full environment from the KeePass entry `Supabase A2 OmGithub environment`.
Keep gateway port 8000 and pooler ports 5432/6543 bound to host loopback.
Route Studio through the explicit Caddy site before the game wildcard.

Connect OmGithub through Docker network `supabase_default` to
`supabase-db:5432/postgres`. Set `SUPABASE_DB_URL` in the application environment.
Use database role `omgithub`. Grant table access and a server-only RLS policy
to that role. Keep database credentials out of the browser.

Apply `server/migrations/001-supabase.sql` with `psql -v ON_ERROR_STOP=1`
as the PostgreSQL administrator. Preserve each record ID and JSON body.
Use the five public tables for projects, aggregates, votes, comments, and plays.
Keep project changes atomic with PostgreSQL advisory transaction locks.
Require a working database before production startup.

## Complete the deferred legacy import

Preserve `/home/ubuntu/projects/omgithub/.env.before-supabase` for the
legacy service account. Keep `SOCIAL_WRITES_PAUSED=true` until the import
finishes. Continue game launches without counting plays during this pause.

Run `scripts/export-legacy-firestore.mjs` with the legacy environment in a
temporary Node container after the Firebase read quota resets. Mount the
application data volume and save the export there. Stop on HTTP 429; retry later.
Keep Firebase unchanged.

Compare exported project IDs and metadata with the 103 records restored from
`projects.json` on 2026-09-10. Insert missing projects. Preserve newer Supabase
publication or metadata changes when reconciling matching records.
Import the four social tables with `server/cli/import-supabase.mjs`.
Remove the projects key from a copy of the export before importing social tables.
Require empty destination social tables; do not overwrite live records.

Verify all social row counts and record bodies against the export. Set
`SOCIAL_WRITES_PAUSED=false`, recreate the application, and verify rating,
comment, and play endpoints. Keep the original export for rollback.

## Verify and back up

Run `npm test`, `npm run build`, and `git diff --check`.
Set `SUPABASE_TEST_DB_URL` to run the PostgreSQL integration test.
Use an isolated test project; let the test remove its records.

Run `scripts/backup-supabase-a2.sh` as root on A2. Keep dumps under
`/home/ubuntu/backups/supabase`. Retain the installation environment and volume
files separately. Copy backups off the host for host-loss recovery.

Check `docker compose ps` in the Supabase directory. Check
`https://omgithub.com/health` and `https://omgithub.com/api/projects`.
Preserve the application image `omgithub:before-supabase`, the previous
environment, and `/app/data/before-supabase-catalog.tgz` for rollback.
Expect Firebase rollback to remain unavailable while its read quota is exhausted.
