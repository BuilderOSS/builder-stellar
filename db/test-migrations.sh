#!/bin/bash
#
# Migration integrity checks.
#
#   ./db/test-migrations.sh
#       Static checks only: naming, a rollback for every migration, no
#       CONCURRENTLY (migrations run in one transaction), no role-dependent SQL.
#
#   TEST_DATABASE_URL=postgres://admin@localhost:5432/postgres ./db/test-migrations.sh
#       Also creates a scratch database on that server, then runs
#       migrate -> idempotent re-migrate -> rollback -> migrate, checks the
#       destructive scripts' confirmation and the role grants (the writer's
#       schema guard included), runs the Goldsky read-model integration tests
#       (events through the real pipeline transforms, then asserts on the views
#       and the Prisma schema), and finally drops the scratch database. The
#       URL's role needs CREATEDB and must be a superuser (roles and an event
#       trigger are created); use a throwaway server.
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

count=0
for migration in "$MIGRATIONS_DIR"/*.sql; do
  version="$(basename "$migration" .sql)"
  [[ "$version" =~ ^[0-9]{4}_[a-z0-9_]+$ ]] || { echo "bad migration name: $version" >&2; exit 1; }
  [ -f "$ROLLBACK_DIR/${version}_rollback.sql" ] || { echo "missing rollback: $version" >&2; exit 1; }
  if grep -qi 'CONCURRENTLY' "$migration"; then echo "$version uses CONCURRENTLY; migrations run in a transaction" >&2; exit 1; fi
  if grep -qiE '(GRANT|REVOKE)[^;]*(app_server|goldsky_writer)' "$migration"; then
    echo "$version grants to a role; grants belong in grant-permissions.sh" >&2; exit 1
  fi
  count=$((count + 1))
done
for rollback in "$ROLLBACK_DIR"/*_rollback.sql; do
  [ -f "$MIGRATIONS_DIR/$(basename "$rollback" _rollback.sql).sql" ] || { echo "orphan rollback: $rollback" >&2; exit 1; }
done
echo "✓ static checks passed ($count migrations, a rollback for each)"

[ -n "${TEST_DATABASE_URL:-}" ] || { echo "(set TEST_DATABASE_URL to also run the database tests)"; exit 0; }
command -v psql > /dev/null || { echo "psql is required with TEST_DATABASE_URL" >&2; exit 1; }

# The admin connection (CREATE/DROP DATABASE) and the scratch database are both
# reached through the service file, so no password is on a command line: psql
# gets "service=db dbname=<scratch>", the scripts get DATABASE_URL in their
# environment.
admin_url="$TEST_DATABASE_URL"
use_database_url "$admin_url"
scratch="stellar_migration_test_$$"
scratch_url="$(echo "$admin_url" | sed -E "s#^([a-z]+://[^/?]*)/?[^?]*#\\1/$scratch#")"
scratch_conn="service=db dbname=$scratch"
psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $scratch"
trap 'psql -q -c "DROP DATABASE IF EXISTS $scratch WITH (FORCE)" > /dev/null; db_cleanup' EXIT
on_scratch() { DATABASE_URL="$scratch_url" bash "$@"; }
expect_refusal() {
  local what="$1"; shift
  if "$@" < /dev/null > /dev/null 2>&1; then echo "$what was not refused" >&2; exit 1; fi
}

echo "→ migrate"
on_scratch "$DB_DIR/migrate.sh" > /dev/null
echo "→ migrate again (must be a no-op)"
on_scratch "$DB_DIR/migrate.sh" | grep "0 migration(s) applied" > /dev/null

echo "→ the destructive scripts refuse without the database name"
applied="$(psql "$scratch_conn" -Atc "SELECT count(*) FROM public.schema_migrations")"
expect_refusal "a URL argument" bash "$DB_DIR/migrate.sh" "$scratch_url"
expect_refusal "rollback --yes" on_scratch "$DB_DIR/rollback.sh" --yes
expect_refusal "rollback without a terminal" on_scratch "$DB_DIR/rollback.sh"
expect_refusal "rollback naming another database" on_scratch "$DB_DIR/rollback.sh" --confirm-database postgres
expect_refusal "reset --yes" on_scratch "$DB_DIR/reset-database.sh" --yes
expect_refusal "reset without a terminal" on_scratch "$DB_DIR/reset-database.sh"
expect_refusal "reset naming another database" on_scratch "$DB_DIR/reset-database.sh" --confirm-database postgres
[ "$(psql "$scratch_conn" -Atc "SELECT count(*) FROM public.schema_migrations")" = "$applied" ] \
  || { echo "a refused rollback or reset changed the database" >&2; exit 1; }

echo "→ rollback everything"
on_scratch "$DB_DIR/rollback.sh" --confirm-database "$scratch" > /dev/null
left="$(psql "$scratch_conn" -Atc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ($(sql_schema_list))")"
[ "$left" = "0" ] || { echo "rollback left $left schema(s) behind" >&2; exit 1; }
echo "→ migrate after rollback"
on_scratch "$DB_DIR/migrate.sh" > /dev/null

echo "→ every app view reads as app_server (no chain.* access)"
# Roles are cluster-wide: create the two pipeline/app roles (NOLOGIN) if this
# cluster lacks them, give the writer the database CREATE that setup-roles.sh
# grants, apply the real grants, then read every view as the app.
psql "$scratch_conn" -v ON_ERROR_STOP=1 -q -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_server') THEN CREATE ROLE app_server NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'goldsky_writer') THEN CREATE ROLE goldsky_writer NOLOGIN; END IF;
END \$\$" -c "GRANT CREATE ON DATABASE $scratch TO goldsky_writer"
on_scratch "$DB_DIR/grant-permissions.sh" > /dev/null
for view in $(psql "$scratch_conn" -Atc "SELECT schemaname || '.' || viewname FROM pg_views WHERE schemaname IN ($(sql_app_schema_list)) ORDER BY 1"); do
  psql "$scratch_conn" -v ON_ERROR_STOP=1 -q -c "SET ROLE app_server; SELECT * FROM $view LIMIT 1" > /dev/null \
    || { echo "app_server cannot read $view" >&2; exit 1; }
done

echo "→ goldsky_writer creates only streamling"
as_writer() { psql "$scratch_conn" -v ON_ERROR_STOP=1 -q -c "SET ROLE goldsky_writer" -c "$1" > /dev/null 2>&1; }
as_writer "CREATE SCHEMA IF NOT EXISTS streamling" || { echo "the writer cannot create streamling" >&2; exit 1; }
as_writer "CREATE TABLE IF NOT EXISTS streamling.dao_tokens (contract_id text PRIMARY KEY)" \
  || { echo "the writer cannot create its dynamic tables" >&2; exit 1; }
for sql in "CREATE SCHEMA IF NOT EXISTS streamling" "CREATE SCHEMA IF NOT EXISTS chain" "CREATE SCHEMA IF NOT EXISTS app"; do
  as_writer "$sql" || { echo "the writer's no-op '$sql' failed" >&2; exit 1; }
done
for sql in "CREATE SCHEMA writer_extra" "CREATE SCHEMA IF NOT EXISTS writer_extra" "ALTER SCHEMA streamling RENAME TO writer_extra" \
  "CREATE EXTENSION IF NOT EXISTS pgcrypto" "CREATE PUBLICATION writer_extra"; do
  if as_writer "$sql"; then echo "the writer was allowed to: $sql" >&2; exit 1; fi
done
[ "$(psql "$scratch_conn" -Atc "SELECT count(*) FROM pg_namespace WHERE nspname = 'writer_extra'")" = "0" ] \
  || { echo "the writer created a schema" >&2; exit 1; }

echo "→ read-model integration tests"
# One after the other: each test file lands its own events and reads the views.
for test_file in read-model.integration.test.mjs module-roles.integration.test.mjs; do
  (cd "$DB_DIR/../packages/goldsky" && TEST_DATABASE_URL="$scratch_conn" node --test "test/$test_file")
done
echo "✓ database checks passed"
