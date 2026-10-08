#!/bin/bash
#
# Drop every schema owned by the migrations plus the migration ledger, leaving
# an empty database ready for ./db/migrate.sh. DELETES ALL INDEXED DATA.
#
# After a reset, the Goldsky pipeline must be redeployed so it replays from its
# start ledger (see packages/goldsky/README.md).
#
#   ./db/reset-database.sh [--yes] [database_url]
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

assume_yes=false
url=""
for arg in "$@"; do
  case "$arg" in
    --yes) assume_yes=true ;;
    *) url="$arg" ;;
  esac
done

require_database "$url"
echo -e "${RED}⚠️  This drops schemas: ${SCHEMAS[*]} and public.schema_migrations${NC}"
echo "Target: $(redact_url "$DATABASE_URL")"
if [ "$assume_yes" != true ]; then
  read -r -p "Type 'yes' to continue: " confirm
  [ "$confirm" = "yes" ] || { echo "Reset cancelled"; exit 0; }
fi

# Reverse creation order; CASCADE removes cross-schema view dependencies.
for ((i = ${#SCHEMAS[@]} - 1; i >= 0; i--)); do
  psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS ${SCHEMAS[$i]} CASCADE"
done
psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" -c "DROP TABLE IF EXISTS public.schema_migrations"

remaining="$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ($(sql_schema_list))")"
[ "$remaining" = "0" ] || { echo -e "${RED}✗ $remaining schema(s) remain${NC}" >&2; exit 1; }

echo -e "${GREEN}✓ Database reset${NC}"
echo "Next: ./db/migrate.sh && ./db/grant-permissions.sh, then redeploy the Goldsky pipeline."
