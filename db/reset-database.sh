#!/bin/bash
#
# Reset Database - Clean Slate for Re-running Migrations
#
# Drops all Goldsky schemas and migration tracking to allow clean re-run.
# USE WITH CAUTION - This deletes all data!
#
# Usage:
#   ./db/reset-database.sh [database_url]
#   DATABASE_URL=postgres://... ./db/reset-database.sh
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
  echo "  ./db/reset-database.sh postgres://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgres://... ./db/reset-database.sh"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Reset Goldsky Database${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

echo -e "${RED}⚠️  WARNING: This will delete ALL Goldsky data!${NC}"
echo ""
echo "This will drop:"
echo "  - All schemas: chain, governance, token, auction, treasury, app"
echo "  - All tables and views in those schemas"
echo "  - Migration tracking table (schema_migrations)"
echo ""

read -p "Are you absolutely sure? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
  echo ""
  echo -e "${YELLOW}Reset cancelled${NC}"
  exit 0
fi

echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo -e "${RED}Error: psql is not installed${NC}"
  exit 1
fi

# Test database connection
echo -e "${YELLOW}→ Testing database connection...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo -e "${RED}✗ Failed to connect to database${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Drop schemas
echo -e "${YELLOW}→ Dropping Goldsky schemas...${NC}"

psql "$DATABASE_URL" << 'EOF'
-- Drop schemas in reverse dependency order
DROP SCHEMA IF EXISTS app CASCADE;
DROP SCHEMA IF EXISTS treasury CASCADE;
DROP SCHEMA IF EXISTS auction CASCADE;
DROP SCHEMA IF EXISTS token CASCADE;
DROP SCHEMA IF EXISTS governance CASCADE;
DROP SCHEMA IF EXISTS chain CASCADE;
EOF

echo -e "${GREEN}✓ Schemas dropped${NC}"
echo ""

# Drop migration tracking
echo -e "${YELLOW}→ Dropping migration tracking...${NC}"

psql "$DATABASE_URL" << 'EOF'
DROP TABLE IF EXISTS public.schema_migrations;
EOF

echo -e "${GREEN}✓ Migration tracking dropped${NC}"
echo ""

# Verify clean state
echo -e "${YELLOW}→ Verifying clean state...${NC}"

REMAINING_SCHEMAS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('chain', 'governance', 'token', 'auction', 'treasury', 'app')" | tr -d ' ')

MIGRATION_TABLE=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'" | tr -d ' ')

if [ "$REMAINING_SCHEMAS" -eq 0 ] && [ "$MIGRATION_TABLE" -eq 0 ]; then
  echo -e "${GREEN}✓ Database is clean${NC}"
else
  echo -e "${RED}✗ Some schemas or tables remain${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Database reset complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

echo -e "${CYAN}Next steps:${NC}"
echo "  1. Run migrations: ./db/migrate.sh"
echo "  2. Grant permissions: ./db/grant-permissions.sh"
echo "  3. Verify setup: ./db/debug-database.sh"
echo ""
