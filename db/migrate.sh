#!/bin/bash
#
# Apply pending migrations in db/migrations, in order.
#
#   ./db/migrate.sh [database_url]
#   DATABASE_URL=postgres://... ./db/migrate.sh
#
# Each migration runs in one transaction together with its ledger row in
# public.schema_migrations. The ledger stores a SHA-256 of the file, so an
# already-applied migration that was edited afterwards aborts the run instead
# of silently diverging. Migrations are append-only once deployed.
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_database "${1:-}"
echo -e "${BLUE}Applying migrations to $(redact_url "$DATABASE_URL")${NC}"

psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" -c "
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

applied=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  version="$(basename "$file" .sql)"
  checksum="$(migration_checksum "$file")"

  recorded="$(psql "$DATABASE_URL" -Atc "SELECT checksum FROM public.schema_migrations WHERE version = '$version'")"
  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$checksum" ]; then
      echo -e "${RED}✗ $version was modified after it was applied (ledger $recorded, file $checksum)${NC}" >&2
      exit 1
    fi
    echo -e "  ${GREEN}✓${NC} $version (already applied)"
    continue
  fi

  echo -e "  ${YELLOW}→${NC} $version"
  # One session holds the advisory lock so concurrent runners serialize.
  psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" > /dev/null <<SQL
SELECT pg_advisory_lock(hashtextextended('stellar-builder-migrations', 0));
BEGIN;
\i $file
INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum');
COMMIT;
SQL
  applied=$((applied + 1))
done

echo -e "${GREEN}✓ Done: $applied migration(s) applied${NC}"
echo "Next: ./db/grant-permissions.sh (after ./db/setup-roles.sh on a new database)"
