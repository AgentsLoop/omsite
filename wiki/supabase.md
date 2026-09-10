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

## Keep the completed migration state

Use the 103 restored catalog records as the migration baseline.
Keep `SOCIAL_WRITES_PAUSED=false`. Accept new ratings, comments, and play
counts directly in Supabase.

Do not resume the legacy social import or its canceled hourly follow-up.
Follow the user's 2026-09-10 decision to omit the old social records.
Keep the legacy environment and catalog backup only for manual recovery.
Do not overwrite new Supabase records with legacy data.

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
