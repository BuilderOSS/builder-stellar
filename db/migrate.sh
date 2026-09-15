#!/bin/bash
#
# Database Migration Runner for Goldsky Schema
#
# Usage:
#   ./db/migrate.sh [database_url]
#   DATABASE_URL=postgres://... ./db/migrate.sh
#
# Environment Variables:
#   DATABASE_URL - PostgreSQL connection string (required)
#

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get database URL from argument or environment
DATABASE_URL="${1:-$DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL not provided${NC}"
  echo ""
  echo "Usage:"
  echo "  ./db/migrate.sh postgres://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgres://... ./db/migrate.sh"
  exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Goldsky Database Migration Runner${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo -e "${RED}Error: psql is not installed${NC}"
  echo "Please install PostgreSQL client:"
  echo "  macOS: brew install postgresql"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  echo "  Windows: https://www.postgresql.org/download/windows/"
  exit 1
fi

# Test database connection
echo -e "${YELLOW}→ Testing database connection...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo -e "${RED}✗ Failed to connect to database${NC}"
  echo "Please check your DATABASE_URL"
  exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Create migration tracking table if it doesn't exist
echo -e "${YELLOW}→ Creating migration tracking table...${NC}"
psql "$DATABASE_URL" -c "
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);" > /dev/null
echo -e "${GREEN}✓ Migration tracking ready${NC}"
echo ""

# Function to check if migration has been applied
migration_applied() {
  local version="$1"
  psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM public.schema_migrations WHERE version = '$version'" | tr -d ' '
}

# Function to run a migration
run_migration() {
  local file="$1"
  local version=$(basename "$file" .sql)

  echo -e "${YELLOW}→ Checking migration: $version${NC}"

  if [ "$(migration_applied "$version")" -gt 0 ]; then
    echo -e "${BLUE}  ↳ Already applied, skipping${NC}"
    return 0
  fi

  echo -e "${YELLOW}  ↳ Applying migration...${NC}"

  # Run migration in a transaction
  psql "$DATABASE_URL" << EOF
BEGIN;

-- Run the migration
\i $file

-- Record migration
INSERT INTO public.schema_migrations (version) VALUES ('$version');

COMMIT;
EOF

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Successfully applied $version${NC}"
  else
    echo -e "${RED}  ✗ Failed to apply $version${NC}"
    echo -e "${RED}  Migration rolled back${NC}"
    exit 1
  fi

  echo ""
}

# Run migrations in order
echo -e "${BLUE}Running migrations...${NC}"
echo ""

for migration_file in "$MIGRATIONS_DIR"/*.sql; do
  if [ -f "$migration_file" ]; then
    run_migration "$migration_file"
  fi
done

# Show final status
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ All migrations completed successfully!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# Show applied migrations
echo -e "${YELLOW}Applied migrations:${NC}"
psql "$DATABASE_URL" -c "SELECT version, applied_at FROM public.schema_migrations ORDER BY applied_at"
echo ""

# Show schema summary
echo -e "${YELLOW}Schema summary:${NC}"
psql "$DATABASE_URL" -c "
SELECT
  schemaname,
  COUNT(*) as table_count
FROM pg_tables
WHERE schemaname IN ('chain', 'governance', 'token', 'auction', 'treasury', 'app')
GROUP BY schemaname
ORDER BY schemaname;"
