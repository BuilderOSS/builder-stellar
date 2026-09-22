#!/bin/bash
#
# Rollback Database Migrations
#
# Rolls back all migrations in reverse order (7 → 0).
# Use ONLY in emergency recovery scenarios.
#
# Usage:
#   ./db/rollback.sh [database_url]
#   DATABASE_URL=postgres://... ./db/rollback.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get database URL
DATABASE_URL="${1:-$DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL not provided${NC}"
  echo ""
  echo "Usage:"
  echo "  ./db/rollback.sh postgres://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgres://... ./db/rollback.sh"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${RED}  DATABASE ROLLBACK (REVERSE MIGRATIONS)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will DELETE all views and data!${NC}"
echo ""
echo -e "${YELLOW}Target database:${NC}"
echo "  $(echo $DATABASE_URL | sed 's/:\/\/.*@/:\/\/<redacted>@/')"
echo ""
read -p "Continue with rollback? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${GREEN}Rollback cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${BLUE}Starting rollback...${NC}"
echo ""

# Test connection
echo -e "${YELLOW}→ Testing database connection...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo -e "${RED}✗ Failed to connect to database${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Connection successful${NC}"
echo ""

# Rollback in reverse order (8 → 0)
ROLLBACK_FILES=(
  "db/rollback/0008_decoded_events_indexes_rollback.sql"
  "db/rollback/0007_app_views_rollback.sql"
  "db/rollback/0006_metadata_views_rollback.sql"
  "db/rollback/0005_treasury_views_rollback.sql"
  "db/rollback/0004_auction_views_rollback.sql"
  "db/rollback/0003_token_views_rollback.sql"
  "db/rollback/0002_governance_views_rollback.sql"
  "db/rollback/0001_manager_views_rollback.sql"
  "db/rollback/0000_base_tables_rollback.sql"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for ROLLBACK_FILE in "${ROLLBACK_FILES[@]}"; do
  if [ ! -f "$ROLLBACK_FILE" ]; then
    echo -e "${YELLOW}⊘ Skipping $ROLLBACK_FILE (not found)${NC}"
    continue
  fi

  STEP_NAME=$(basename "$ROLLBACK_FILE" _rollback.sql)
  echo -e "${YELLOW}→ Rolling back $STEP_NAME...${NC}"

  if psql "$DATABASE_URL" -f "$ROLLBACK_FILE" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ $STEP_NAME rolled back${NC}"
    ((SUCCESS_COUNT++))
  else
    echo -e "${RED}✗ Failed to rollback $STEP_NAME${NC}"
    ((FAIL_COUNT++))
  fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}Rollback complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "Successful: ${GREEN}$SUCCESS_COUNT${NC}"
echo -e "Failed: ${FAIL_COUNT > 0 ? RED : GREEN}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${YELLOW}Some rollbacks failed. Check logs above.${NC}"
  exit 1
else
  echo -e "${GREEN}All rollbacks successful!${NC}"
  exit 0
fi
