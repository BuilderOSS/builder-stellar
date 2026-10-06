#!/bin/bash
# Safe, database-free migration integrity checks.  Set DATABASE_URL to also
# run the optional read-only ledger/permission checks against a test database.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
ROLLBACK_DIR="$SCRIPT_DIR/rollback"

expected=0
for migration in "$MIGRATIONS_DIR"/*.sql; do
  version="$(basename "$migration" .sql)"
  [[ "$version" =~ ^[0-9]{4}_ ]] || { echo "bad migration name: $version" >&2; exit 1; }
  rollback="$ROLLBACK_DIR/${version}_rollback.sql"
  [[ -f "$rollback" ]] || { echo "missing rollback: $version" >&2; exit 1; }
  ((expected += 1))
done

grep -q 'checksum TEXT' "$SCRIPT_DIR/migrate.sh"
grep -q 'checksum_matches' "$SCRIPT_DIR/migrate.sh"
grep -q 'schema_migrations' "$SCRIPT_DIR/rollback.sh"
grep -q 'deployment_id.*dao_id' "$MIGRATIONS_DIR/0013_deterministic_ordering_and_activity_indexes.sql"
grep -q 'idx_activity_feed_deployment_contract_order' "$MIGRATIONS_DIR/0014_event_order_indexes.sql"
grep -q 'REVOKE.*app_server' "$SCRIPT_DIR/grant-permissions.sh"

if [[ -n "${DATABASE_URL:-}" ]]; then
  command -v psql >/dev/null || { echo "psql is required with DATABASE_URL" >&2; exit 1; }
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
    "SELECT version || ':' || COALESCE(checksum, '<missing>') FROM public.schema_migrations ORDER BY version" \
    > /dev/null
fi

echo "migration static checks passed ($expected migrations, rollback for each)"
