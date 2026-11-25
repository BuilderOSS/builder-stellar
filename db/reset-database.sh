#!/bin/bash
#
# Drop every schema owned by the migrations plus the migration ledger, leaving
# an empty database ready for ./db/migrate.sh. DELETES ALL INDEXED DATA.
#
# After a reset, the Goldsky pipeline must be redeployed so it replays from its
# start ledger (see packages/goldsky/README.md).
#
#   DATABASE_URL=postgres://... ./db/reset-database.sh [--confirm-database NAME]
#
# The script asks for the database name, typed in full. --confirm-database NAME
# confirms without a prompt; NAME must be the database the URL connects to.
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

confirm=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes)
      echo -e "${RED}Error: --yes is not enough; pass --confirm-database <name> or type the name when asked${NC}" >&2
      exit 1 ;;
    --confirm-database) shift; confirm="${1:?--confirm-database needs the database name}" ;;
    *)
      echo -e "${RED}Error: unknown argument '${1%%://*}…'; the database URL goes in DATABASE_URL, not on the command line${NC}" >&2
      exit 1 ;;
  esac
  shift
done

require_database
echo -e "${RED}⚠️  This drops schemas: ${SCHEMAS[*]} and public.schema_migrations${NC}"
confirm_database "$confirm" "reset it"

# Reverse creation order; CASCADE removes cross-schema view dependencies.
for ((i = ${#SCHEMAS[@]} - 1; i >= 0; i--)); do
  psql -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA IF EXISTS ${SCHEMAS[$i]} CASCADE"
done
psql -v ON_ERROR_STOP=1 -q -c "DROP TABLE IF EXISTS public.schema_migrations"

remaining="$(psql -Atc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ($(sql_schema_list))")"
[ "$remaining" = "0" ] || { echo -e "${RED}✗ $remaining schema(s) remain${NC}" >&2; exit 1; }

echo -e "${GREEN}✓ Database reset${NC}"
echo "Next: ./db/migrate.sh && ./db/grant-permissions.sh, then redeploy the Goldsky pipeline."
