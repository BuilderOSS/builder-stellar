#!/bin/bash
#
# Grant Database Permissions for Goldsky Roles
#
# Grants appropriate permissions to goldsky_writer and app_server roles
# after migrations have created the schemas and tables.
#
# Usage:
#   ./db/grant-permissions.sh [database_url]
#   DATABASE_URL=postgres://... ./db/grant-permissions.sh
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
  echo "  ./db/grant-permissions.sh postgres://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgres://... ./db/grant-permissions.sh"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Grant Database Permissions${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
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

# Check if roles exist
echo -e "${YELLOW}→ Checking roles...${NC}"

GOLDSKY_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_roles WHERE rolname = 'goldsky_writer'" | tr -d ' ')
APP_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_roles WHERE rolname = 'app_server'" | tr -d ' ')

if [ "$GOLDSKY_EXISTS" -eq 0 ]; then
  echo -e "${RED}✗ goldsky_writer role does not exist${NC}"
  echo "Run ./db/setup-roles.sh first"
  exit 1
fi

if [ "$APP_EXISTS" -eq 0 ]; then
  echo -e "${RED}✗ app_server role does not exist${NC}"
  echo "Run ./db/setup-roles.sh first"
  exit 1
fi

echo -e "${GREEN}✓ Both roles exist${NC}"
echo ""

# Check if schemas exist
echo -e "${YELLOW}→ Checking schemas...${NC}"

SCHEMAS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('chain', 'governance', 'token', 'auction', 'treasury', 'app')" | tr -d ' ')

if [ "$SCHEMAS" -eq 0 ]; then
  echo -e "${RED}✗ Required schemas do not exist${NC}"
  echo "Run ./db/migrate.sh first"
  exit 1
fi

echo -e "${GREEN}✓ Found $SCHEMAS schemas${NC}"
echo ""

# Grant permissions
echo -e "${BLUE}Granting permissions...${NC}"
echo ""

echo -e "${YELLOW}→ Granting permissions to goldsky_writer...${NC}"

psql "$DATABASE_URL" << 'EOF'
-- Grant schema usage and create permissions
GRANT USAGE ON SCHEMA chain TO goldsky_writer;
GRANT USAGE ON SCHEMA governance TO goldsky_writer;
GRANT USAGE ON SCHEMA token TO goldsky_writer;
GRANT USAGE ON SCHEMA auction TO goldsky_writer;
GRANT USAGE ON SCHEMA treasury TO goldsky_writer;
GRANT USAGE ON SCHEMA app TO goldsky_writer;

-- Grant CREATE permission (needed for Goldsky's CREATE TABLE IF NOT EXISTS)
GRANT CREATE ON SCHEMA chain TO goldsky_writer;
GRANT CREATE ON SCHEMA governance TO goldsky_writer;
GRANT CREATE ON SCHEMA token TO goldsky_writer;
GRANT CREATE ON SCHEMA auction TO goldsky_writer;
GRANT CREATE ON SCHEMA treasury TO goldsky_writer;
GRANT CREATE ON SCHEMA app TO goldsky_writer;

-- Grant table permissions (INSERT, UPDATE, DELETE for data writes)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA chain TO goldsky_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance TO goldsky_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA token TO goldsky_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auction TO goldsky_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA treasury TO goldsky_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO goldsky_writer;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO goldsky_writer;

-- Grant default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA chain GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO goldsky_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA governance GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO goldsky_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA token GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO goldsky_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA auction GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO goldsky_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA treasury GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO goldsky_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO goldsky_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO goldsky_writer;
EOF

echo -e "${GREEN}✓ goldsky_writer permissions granted${NC}"
echo ""

echo -e "${YELLOW}→ Granting permissions to app_server (read-only)...${NC}"

psql "$DATABASE_URL" << 'EOF'
-- Grant schema usage
GRANT USAGE ON SCHEMA chain TO app_server;
GRANT USAGE ON SCHEMA governance TO app_server;
GRANT USAGE ON SCHEMA token TO app_server;
GRANT USAGE ON SCHEMA auction TO app_server;
GRANT USAGE ON SCHEMA treasury TO app_server;
GRANT USAGE ON SCHEMA app TO app_server;

-- Grant SELECT only (read-only access)
GRANT SELECT ON ALL TABLES IN SCHEMA chain TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA token TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA auction TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA treasury TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_server;

-- Grant default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA chain GRANT SELECT ON TABLES TO app_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA governance GRANT SELECT ON TABLES TO app_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA token GRANT SELECT ON TABLES TO app_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA auction GRANT SELECT ON TABLES TO app_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA treasury GRANT SELECT ON TABLES TO app_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO app_server;
EOF

echo -e "${GREEN}✓ app_server permissions granted${NC}"
echo ""

# Show summary
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Permissions granted successfully!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Permission summary:${NC}"
echo ""

psql "$DATABASE_URL" << 'EOF'
SELECT
  grantee,
  table_schema,
  COUNT(DISTINCT table_name) as table_count,
  STRING_AGG(DISTINCT privilege_type, ', ' ORDER BY privilege_type) as privileges
FROM information_schema.table_privileges
WHERE grantee IN ('goldsky_writer', 'app_server')
  AND table_schema IN ('chain', 'governance', 'token', 'auction', 'treasury', 'app')
GROUP BY grantee, table_schema
ORDER BY grantee, table_schema;
EOF

echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Test goldsky_writer connection:"
echo "     psql \"postgres://goldsky_writer:password@host/db\" -c \"SELECT 1\""
echo ""
echo "  2. Test app_server connection:"
echo "     psql \"postgres://app_server:password@host/db\" -c \"SELECT 1\""
echo ""
echo "  3. Deploy Goldsky pipeline:"
echo "     cd packages/goldsky && ./scripts/deploy.sh deploy"
echo ""
