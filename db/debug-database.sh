#!/bin/bash
#
# Database Debug Script
#
# Shows the current state of the database including:
# - Existing roles
# - Existing schemas
# - Existing tables
# - Applied migrations
# - Permissions
#
# Usage:
#   ./db/debug-database.sh [database_url]
#   DATABASE_URL=postgres://... ./db/debug-database.sh
#

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get database URL from argument or environment
DATABASE_URL="${1:-$DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL not provided${NC}"
  echo ""
  echo "Usage:"
  echo "  ./db/debug-database.sh postgres://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgres://... ./db/debug-database.sh"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Database Debug Report${NC}"
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
echo -e "${GREEN}✓ Connected successfully${NC}"
echo ""

# Database info
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Database Information${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

psql "$DATABASE_URL" << 'EOF'
SELECT
  current_database() as database_name,
  current_user as connected_as,
  version() as postgres_version;
EOF

echo ""

# Check roles
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Database Roles${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

psql "$DATABASE_URL" << 'EOF'
SELECT
  rolname as role_name,
  rolcanlogin as can_login,
  rolcreatedb as can_create_db,
  rolcreaterole as can_create_role
FROM pg_roles
WHERE rolname IN ('goldsky_writer', 'app_server')
   OR rolname = current_user
ORDER BY rolname;
EOF

echo ""

GOLDSKY_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_roles WHERE rolname = 'goldsky_writer'" | tr -d ' ')
APP_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_roles WHERE rolname = 'app_server'" | tr -d ' ')

if [ "$GOLDSKY_EXISTS" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  goldsky_writer role does not exist${NC}"
  echo ""
fi

if [ "$APP_EXISTS" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  app_server role does not exist${NC}"
  echo ""
fi

# Check schemas
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Database Schemas${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

psql "$DATABASE_URL" << 'EOF'
SELECT
  schema_name,
  schema_owner
FROM information_schema.schemata
WHERE schema_name IN ('public', 'chain', 'governance', 'token', 'auction', 'treasury', 'app')
ORDER BY
  CASE schema_name
    WHEN 'public' THEN 0
    WHEN 'chain' THEN 1
    WHEN 'governance' THEN 2
    WHEN 'token' THEN 3
    WHEN 'auction' THEN 4
    WHEN 'treasury' THEN 5
    WHEN 'app' THEN 6
  END;
EOF

echo ""

# Check tables
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Tables per Schema${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

psql "$DATABASE_URL" << 'EOF'
SELECT
  schemaname as schema_name,
  COUNT(*) as table_count,
  STRING_AGG(tablename, ', ' ORDER BY tablename) as tables
FROM pg_tables
WHERE schemaname IN ('public', 'chain', 'governance', 'token', 'auction', 'treasury', 'app')
GROUP BY schemaname
ORDER BY
  CASE schemaname
    WHEN 'public' THEN 0
    WHEN 'chain' THEN 1
    WHEN 'governance' THEN 2
    WHEN 'token' THEN 3
    WHEN 'auction' THEN 4
    WHEN 'treasury' THEN 5
    WHEN 'app' THEN 6
  END;
EOF

echo ""

# Check migrations
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Applied Migrations${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

MIGRATIONS_TABLE_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'" | tr -d ' ')

if [ "$MIGRATIONS_TABLE_EXISTS" -eq 1 ]; then
  psql "$DATABASE_URL" << 'EOF'
SELECT
  version,
  applied_at
FROM public.schema_migrations
ORDER BY applied_at;
EOF
  echo ""
else
  echo -e "${YELLOW}⚠️  schema_migrations table does not exist${NC}"
  echo "Migrations have not been run yet"
  echo ""
fi

# Check permissions
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Role Permissions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$GOLDSKY_EXISTS" -eq 1 ] || [ "$APP_EXISTS" -eq 1 ]; then
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

  # Check if permissions are granted
  GOLDSKY_PERMS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.table_privileges WHERE grantee = 'goldsky_writer'" | tr -d ' ')
  APP_PERMS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.table_privileges WHERE grantee = 'app_server'" | tr -d ' ')

  if [ "$GOLDSKY_EXISTS" -eq 1 ] && [ "$GOLDSKY_PERMS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  goldsky_writer has no table permissions${NC}"
    echo ""
  fi

  if [ "$APP_EXISTS" -eq 1 ] && [ "$APP_PERMS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  app_server has no table permissions${NC}"
    echo ""
  fi
else
  echo -e "${YELLOW}No goldsky roles found${NC}"
  echo ""
fi

# Summary and recommendations
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Summary and Next Steps${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SCHEMAS_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('chain', 'governance', 'token', 'auction', 'treasury', 'app')" | tr -d ' ')

# Determine what needs to be done
NEEDS_ROLES=false
NEEDS_MIGRATIONS=false
NEEDS_PERMISSIONS=false

if [ "$GOLDSKY_EXISTS" -eq 0 ] || [ "$APP_EXISTS" -eq 0 ]; then
  NEEDS_ROLES=true
fi

if [ "$SCHEMAS_COUNT" -eq 0 ] || [ "$MIGRATIONS_TABLE_EXISTS" -eq 0 ]; then
  NEEDS_MIGRATIONS=true
fi

if [ "$GOLDSKY_EXISTS" -eq 1 ] && [ "$GOLDSKY_PERMS" -eq 0 ]; then
  NEEDS_PERMISSIONS=true
fi

if [ "$APP_EXISTS" -eq 1 ] && [ "$APP_PERMS" -eq 0 ]; then
  NEEDS_PERMISSIONS=true
fi

# Show status
if [ "$NEEDS_ROLES" = false ] && [ "$NEEDS_MIGRATIONS" = false ] && [ "$NEEDS_PERMISSIONS" = false ]; then
  echo -e "${GREEN}✓ Database is fully set up and ready!${NC}"
  echo ""
  echo "You can now:"
  echo "  1. Deploy Goldsky pipeline: cd packages/goldsky && ./scripts/deploy.sh deploy"
  echo "  2. Use the data access layer in your Next.js app"
else
  echo -e "${YELLOW}Setup required:${NC}"
  echo ""

  if [ "$NEEDS_ROLES" = true ]; then
    echo -e "${YELLOW}→ Step 1: Create database roles${NC}"
    echo "  ./db/setup-roles.sh"
    echo ""
  fi

  if [ "$NEEDS_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}→ Step 2: Run database migrations${NC}"
    echo "  ./db/migrate.sh"
    echo ""
  fi

  if [ "$NEEDS_PERMISSIONS" = true ]; then
    echo -e "${YELLOW}→ Step 3: Grant permissions to roles${NC}"
    echo "  ./db/grant-permissions.sh"
    echo ""
  fi
fi

echo ""
