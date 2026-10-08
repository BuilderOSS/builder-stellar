#!/bin/bash
#
# Roll back applied migrations, newest first, using db/rollback/*_rollback.sql.
# Emergency/dev use only: rolling back removes the views and, for 0001, ALL
# indexed data.
#
#   ./db/rollback.sh [--yes] [--steps N] [database_url]
#
# --steps N  roll back only the newest N applied migrations (default: all)
# --yes      skip the confirmation prompt
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

assume_yes=false
steps=0
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) assume_yes=true ;;
    --steps) shift; steps="${1:?--steps needs a number}" ;;
    *) url="$1" ;;
  esac
  shift
done

require_database "$url"
echo -e "${RED}DATABASE ROLLBACK${NC} on $(redact_url "$DATABASE_URL")"
if [ "$assume_yes" != true ]; then
  read -r -p "Type 'yes' to continue: " confirm
  [ "$confirm" = "yes" ] || { echo "Rollback cancelled"; exit 0; }
fi

done_count=0
while read -r version; do
  [ -n "$version" ] || continue
  if [ "$steps" -gt 0 ] && [ "$done_count" -ge "$steps" ]; then break; fi
  file="$ROLLBACK_DIR/${version}_rollback.sql"
  [ -f "$file" ] || { echo -e "${RED}✗ missing $file${NC}" >&2; exit 1; }
  echo -e "  ${YELLOW}→${NC} rolling back $version"
  psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" <<SQL
BEGIN;
\i $file
DELETE FROM public.schema_migrations WHERE version = '$version';
COMMIT;
SQL
  done_count=$((done_count + 1))
done < <(psql "$DATABASE_URL" -Atc "SELECT version FROM public.schema_migrations ORDER BY version DESC" 2>/dev/null || true)

echo -e "${GREEN}✓ Rolled back $done_count migration(s)${NC}"
