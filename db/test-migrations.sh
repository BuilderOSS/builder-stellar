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
#       migrate -> idempotent re-migrate -> rollback -> migrate and the Goldsky
#       read-model integration test (events through the real pipeline
#       transforms, then asserts on the views and the Prisma schema), and
#       finally drops the scratch database. The URL's role needs CREATEDB.
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

scratch="stellar_migration_test_$$"
admin_url="$TEST_DATABASE_URL"
scratch_url="$(echo "$admin_url" | sed -E "s#/[^/?]*(\\?|\$)#/$scratch\\1#")"
psql -v ON_ERROR_STOP=1 -q "$admin_url" -c "CREATE DATABASE $scratch"
trap 'psql -q "$admin_url" -c "DROP DATABASE IF EXISTS $scratch WITH (FORCE)" > /dev/null' EXIT

echo "→ migrate"
bash "$DB_DIR/migrate.sh" "$scratch_url" > /dev/null
echo "→ migrate again (must be a no-op)"
bash "$DB_DIR/migrate.sh" "$scratch_url" | grep "0 migration(s) applied" > /dev/null
echo "→ rollback everything"
bash "$DB_DIR/rollback.sh" --yes "$scratch_url" > /dev/null
left="$(psql "$scratch_url" -Atc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ($(sql_schema_list))")"
[ "$left" = "0" ] || { echo "rollback left $left schema(s) behind" >&2; exit 1; }
echo "→ migrate after rollback"
bash "$DB_DIR/migrate.sh" "$scratch_url" > /dev/null

echo "→ read-model integration test"
(cd "$DB_DIR/../packages/goldsky" && TEST_DATABASE_URL="$scratch_url" node --test test/read-model.integration.test.mjs)
echo "✓ database checks passed"
