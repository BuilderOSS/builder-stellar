#!/bin/bash
#
# Roll back applied migrations, newest first, using db/rollback/*_rollback.sql.
# Emergency/dev use only: rolling back removes the views and, for 0001, ALL
# indexed data.
#
#   DATABASE_URL=postgres://... ./db/rollback.sh [--steps N] [--confirm-database NAME]
#
# --steps N                 roll back only the newest N applied migrations (default: all)
# --confirm-database NAME   confirm without a prompt; NAME must be the database
#                           the URL connects to (scratch databases and tests)
#
# Without --confirm-database the script asks for the database name, typed in full.
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

confirm=""
steps=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes)
      echo -e "${RED}Error: --yes is not enough; pass --confirm-database <name> or type the name when asked${NC}" >&2
      exit 1 ;;
    --steps) shift; steps="${1:?--steps needs a number}" ;;
    --confirm-database) shift; confirm="${1:?--confirm-database needs the database name}" ;;
    *)
      echo -e "${RED}Error: unknown argument '${1%%://*}…'; the database URL goes in DATABASE_URL, not on the command line${NC}" >&2
      exit 1 ;;
  esac
  shift
done
[[ "$steps" =~ ^[0-9]+$ ]] || { echo -e "${RED}Error: --steps needs a whole number${NC}" >&2; exit 1; }

require_database
echo -e "${RED}DATABASE ROLLBACK${NC}: $([ "$steps" -gt 0 ] && echo "the newest $steps migration(s)" || echo "every migration, and with 0001 all indexed data")"
confirm_database "$confirm" "roll it back"

done_count=0
while read -r version; do
  [ -n "$version" ] || continue
  if [ "$steps" -gt 0 ] && [ "$done_count" -ge "$steps" ]; then break; fi
  file="$ROLLBACK_DIR/${version}_rollback.sql"
  [ -f "$file" ] || { echo -e "${RED}✗ missing $file${NC}" >&2; exit 1; }
  echo -e "  ${YELLOW}→${NC} rolling back $version"
  psql -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
\i $file
DELETE FROM public.schema_migrations WHERE version = '$version';
COMMIT;
SQL
  done_count=$((done_count + 1))
done < <(psql -Atc "SELECT version FROM public.schema_migrations ORDER BY version DESC" 2>/dev/null || true)

echo -e "${GREEN}✓ Rolled back $done_count migration(s)${NC}"
