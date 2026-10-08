#!/bin/bash
# Shared helpers for the db/*.sh scripts. Source it; do not execute it.

# Keep psql quiet about DROP ... CASCADE notices.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$DB_DIR/migrations"
ROLLBACK_DIR="$DB_DIR/rollback"

# Every schema owned by the migrations (landing tables first). Reset and grants
# iterate this list so a new schema only needs to be added here.
SCHEMAS=(chain manager token governance auction metadata treasury marketplace minter app)
# Schemas the web app may read. chain holds raw landing payloads and is never
# exposed; app/manager/... views read it with owner privileges.
APP_SCHEMAS=(manager token governance auction metadata treasury marketplace minter app)

# Comma-separated, quoted list for SQL IN (...) clauses.
sql_schema_list() {
  local out="" s
  for s in "${SCHEMAS[@]}"; do out+="'$s',"; done
  echo "${out%,}"
}

# Resolve DATABASE_URL from $1 or the environment and verify connectivity.
require_database() {
  DATABASE_URL="${1:-${DATABASE_URL:-}}"
  if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL not provided${NC}" >&2
    echo "Usage: $0 [--yes] postgres://user:pass@host:5432/dbname   (or set DATABASE_URL)" >&2
    exit 1
  fi
  command -v psql > /dev/null || { echo -e "${RED}Error: psql is not installed${NC}" >&2; exit 1; }
  psql "$DATABASE_URL" -Atc "SELECT 1" > /dev/null 2>&1 || {
    echo -e "${RED}✗ Failed to connect to database${NC}" >&2
    exit 1
  }
  export DATABASE_URL
}

redact_url() { echo "$1" | sed -E 's#://[^@]*@#://<redacted>@#'; }

migration_checksum() {
  if command -v sha256sum > /dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
