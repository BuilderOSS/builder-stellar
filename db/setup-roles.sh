#!/bin/bash
#
# Database Role Setup for Goldsky
#
# Creates the necessary database roles with appropriate permissions:
# - goldsky_writer: For Goldsky pipeline to write events
# - app_server: For Next.js app to read data (read-only)
#
# Usage:
#   ./db/setup-roles.sh [database_url]
#   DATABASE_URL=postgres://... ./db/setup-roles.sh
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
  echo "  ./db/setup-roles.sh postgres://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgres://... ./db/setup-roles.sh"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Goldsky Database Role Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo -e "${RED}Error: psql is not installed${NC}"
  echo "Please install PostgreSQL client"
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

# Check current roles
echo -e "${YELLOW}→ Checking existing roles...${NC}"
echo ""

EXISTING_ROLES=$(psql "$DATABASE_URL" -t -c "SELECT rolname FROM pg_roles WHERE rolname IN ('goldsky_writer', 'app_server')" | tr -d ' ')

if echo "$EXISTING_ROLES" | grep -q "goldsky_writer"; then
  echo -e "${BLUE}  goldsky_writer role already exists${NC}"
  GOLDSKY_EXISTS=true
else
  echo -e "${YELLOW}  goldsky_writer role does not exist${NC}"
  GOLDSKY_EXISTS=false
fi

if echo "$EXISTING_ROLES" | grep -q "app_server"; then
  echo -e "${BLUE}  app_server role already exists${NC}"
  APP_EXISTS=true
else
  echo -e "${YELLOW}  app_server role does not exist${NC}"
  APP_EXISTS=false
fi

echo ""

# Prompt for passwords
if [ "$GOLDSKY_EXISTS" = false ]; then
  echo -e "${CYAN}Enter password for goldsky_writer role:${NC}"
  read -s GOLDSKY_PASSWORD
  echo ""

  if [ -z "$GOLDSKY_PASSWORD" ]; then
    echo -e "${RED}Error: Password cannot be empty${NC}"
    exit 1
  fi
fi

if [ "$APP_EXISTS" = false ]; then
  echo -e "${CYAN}Enter password for app_server role:${NC}"
  read -s APP_PASSWORD
  echo ""

  if [ -z "$APP_PASSWORD" ]; then
    echo -e "${RED}Error: Password cannot be empty${NC}"
    exit 1
  fi
fi

# Create roles
echo -e "${BLUE}Creating roles...${NC}"
echo ""

if [ "$GOLDSKY_EXISTS" = false ]; then
  echo -e "${YELLOW}→ Creating goldsky_writer role...${NC}"

  psql "$DATABASE_URL" << EOF
-- Create goldsky_writer role
CREATE ROLE goldsky_writer WITH LOGIN PASSWORD '$GOLDSKY_PASSWORD';

-- Grant connect permission
GRANT CONNECT ON DATABASE $(psql "$DATABASE_URL" -t -c "SELECT current_database()" | tr -d ' ') TO goldsky_writer;

-- Grant create permission (needed to create tables)
GRANT CREATE ON DATABASE $(psql "$DATABASE_URL" -t -c "SELECT current_database()" | tr -d ' ') TO goldsky_writer;
EOF

  echo -e "${GREEN}✓ goldsky_writer role created${NC}"
  echo ""
else
  echo -e "${BLUE}→ Skipping goldsky_writer creation (already exists)${NC}"
  echo ""
fi

if [ "$APP_EXISTS" = false ]; then
  echo -e "${YELLOW}→ Creating app_server role...${NC}"

  psql "$DATABASE_URL" << EOF
-- Create app_server role (read-only)
CREATE ROLE app_server WITH LOGIN PASSWORD '$APP_PASSWORD';

-- Grant connect permission
GRANT CONNECT ON DATABASE $(psql "$DATABASE_URL" -t -c "SELECT current_database()" | tr -d ' ') TO app_server;
EOF

  echo -e "${GREEN}✓ app_server role created${NC}"
  echo ""
else
  echo -e "${BLUE}→ Skipping app_server creation (already exists)${NC}"
  echo ""
fi

# Show connection strings
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Role setup complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# Extract host, port, and database from DATABASE_URL
# Format: postgres://user:pass@host:port/database
DB_INFO=$(echo "$DATABASE_URL" | sed -E 's|postgres://[^:]+:[^@]+@([^/]+)/(.+)|\1 \2|')
HOST_PORT=$(echo "$DB_INFO" | cut -d' ' -f1)
DATABASE=$(echo "$DB_INFO" | cut -d' ' -f2)

echo -e "${CYAN}Connection strings for .env:${NC}"
echo ""

if [ "$GOLDSKY_EXISTS" = false ]; then
  echo -e "${YELLOW}# Goldsky writer connection${NC}"
  echo "GOLDSKY_SECRET_NEON_HOST=\"$(echo $HOST_PORT | cut -d: -f1)\""
  echo "GOLDSKY_SECRET_NEON_PORT=\"$(echo $HOST_PORT | cut -d: -f2)\""
  echo "GOLDSKY_SECRET_NEON_DATABASE=\"$DATABASE\""
  echo "GOLDSKY_SECRET_NEON_USER=\"goldsky_writer\""
  echo "GOLDSKY_SECRET_NEON_PASSWORD=\"$GOLDSKY_PASSWORD\""
  echo ""
fi

if [ "$APP_EXISTS" = false ]; then
  echo -e "${YELLOW}# App server connection (read-only)${NC}"
  echo "APP_DATABASE_URL=\"postgres://app_server:$APP_PASSWORD@$HOST_PORT/$DATABASE\""
  echo ""
fi

echo -e "${CYAN}Next steps:${NC}"
echo "  1. Run migrations to create schemas and tables:"
echo "     ./db/migrate.sh"
echo ""
echo "  2. After migrations, grant permissions:"
echo "     ./db/grant-permissions.sh"
echo ""
