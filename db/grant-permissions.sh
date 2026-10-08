#!/bin/bash
#
# Grant the pipeline and app roles their (minimal) privileges. Idempotent; run
# after every ./db/migrate.sh. Create the roles first with ./db/setup-roles.sh.
#
#   goldsky_writer  writes ONLY the three landing tables
#   app_server      read-only on the app-facing schemas; no access to chain.*
#
#   ./db/grant-permissions.sh [database_url]
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_database "${1:-}"

for role in goldsky_writer app_server; do
  exists="$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM pg_roles WHERE rolname = '$role'")"
  [ "$exists" = "1" ] || { echo -e "${RED}✗ role $role does not exist; run ./db/setup-roles.sh${NC}" >&2; exit 1; }
done

app_schema_csv="$(IFS=,; echo "${APP_SCHEMAS[*]}")"
all_schema_csv="$(IFS=,; echo "${SCHEMAS[*]}")"

psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" <<SQL
-- ---------------------------------------------------------------------------
-- goldsky_writer: upsert into the landing tables, nothing else.
-- CREATE on chain/app is required because the Goldsky Postgres sink issues
-- CREATE TABLE IF NOT EXISTS on startup, which PostgreSQL authorizes before it
-- checks whether the table exists. The tables themselves are owned by the
-- migration role, so the writer cannot alter them.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA $all_schema_csv FROM goldsky_writer;
GRANT USAGE, CREATE ON SCHEMA chain, app TO goldsky_writer;
GRANT SELECT, INSERT, UPDATE ON chain.raw_events, chain.decoded_events, app.activity_feed_events TO goldsky_writer;

-- ---------------------------------------------------------------------------
-- app_server: read-only. Views read chain.* with their owner's privileges, so
-- the app never needs (and never gets) access to the raw landing payloads.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA $all_schema_csv FROM app_server;
REVOKE ALL ON SCHEMA $all_schema_csv FROM app_server;
GRANT USAGE ON SCHEMA $app_schema_csv TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA $app_schema_csv TO app_server;
-- The landing table behind app.activity_feed is not an app read surface either.
REVOKE SELECT ON app.activity_feed_events FROM app_server;

-- Views created by future migrations are readable without another grant run.
ALTER DEFAULT PRIVILEGES IN SCHEMA $app_schema_csv GRANT SELECT ON TABLES TO app_server;
SQL

echo -e "${GREEN}✓ Permissions granted${NC}"
psql "$DATABASE_URL" -c "
SELECT grantee, table_schema, count(DISTINCT table_name) AS objects,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.table_privileges
WHERE grantee IN ('goldsky_writer', 'app_server')
  AND table_schema IN ($(sql_schema_list))
GROUP BY grantee, table_schema ORDER BY grantee, table_schema;"
