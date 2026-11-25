#!/bin/bash
#
# Grant the pipeline and app roles their (minimal) privileges. Idempotent; run
# after every ./db/migrate.sh. Create the roles first with ./db/setup-roles.sh.
#
#   goldsky_writer  writes ONLY the three landing tables; may create no schema
#                   but `streamling` (the guard below)
#   app_server      read-only on the app-facing schemas; no access to chain.*
#
#   DATABASE_URL=postgres://... ./db/grant-permissions.sh
#
# Run it as the database owner (on Neon, the project's owner role): installing
# the writer's DDL guard is an event trigger, which needs superuser or, on
# Neon, neon_superuser.
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_database "${1:-}"

for role in goldsky_writer app_server; do
  exists="$(psql -Atc "SELECT count(*) FROM pg_roles WHERE rolname = '$role'")"
  [ "$exists" = "1" ] || { echo -e "${RED}✗ role $role does not exist; run ./db/setup-roles.sh${NC}" >&2; exit 1; }
done

app_schema_csv="$(IFS=,; echo "${APP_SCHEMAS[*]}")"
all_schema_csv="$(IFS=,; echo "${SCHEMAS[*]}")"

psql -v ON_ERROR_STOP=1 -q <<SQL
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
-- goldsky_writer's database-level CREATE (setup-roles.sh) stays: the sink and
-- the dynamic tables issue CREATE SCHEMA IF NOT EXISTS, which PostgreSQL
-- authorises against the database before it checks that the schema exists.
-- That privilege would also let the writer create any schema, extension or
-- publication, so this event trigger refuses each of those the writer runs,
-- except the dynamic tables' own schema, streamling. A no-op IF NOT EXISTS
-- creates nothing and passes. A rename of streamling would let the writer
-- create a second one, so renaming it is refused as well. The writer can't
-- drop or disable the trigger: that needs its owner or a superuser.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.goldsky_writer_ddl_guard()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS \$guard\$
DECLARE
  cmd record;
BEGIN
  IF current_user <> 'goldsky_writer' AND session_user <> 'goldsky_writer' THEN
    RETURN;
  END IF;
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF cmd.command_tag IN ('CREATE SCHEMA', 'ALTER SCHEMA') AND cmd.object_identity <> 'streamling' THEN
      RAISE EXCEPTION 'goldsky_writer may not % %: only streamling is allowed', lower(cmd.command_tag), cmd.object_identity;
    END IF;
    IF cmd.command_tag IN ('CREATE EXTENSION', 'CREATE PUBLICATION', 'ALTER PUBLICATION') THEN
      RAISE EXCEPTION 'goldsky_writer may not run %', cmd.command_tag;
    END IF;
  END LOOP;
END
\$guard\$;
REVOKE ALL ON FUNCTION public.goldsky_writer_ddl_guard() FROM PUBLIC;

DROP EVENT TRIGGER IF EXISTS goldsky_writer_ddl_guard;
CREATE EVENT TRIGGER goldsky_writer_ddl_guard ON ddl_command_end
  WHEN TAG IN ('CREATE SCHEMA', 'ALTER SCHEMA', 'CREATE EXTENSION', 'CREATE PUBLICATION', 'ALTER PUBLICATION')
  EXECUTE FUNCTION public.goldsky_writer_ddl_guard();

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
psql -c "
SELECT grantee, table_schema, count(DISTINCT table_name) AS objects,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.table_privileges
WHERE grantee IN ('goldsky_writer', 'app_server')
  AND table_schema IN ($(sql_schema_list))
GROUP BY grantee, table_schema ORDER BY grantee, table_schema;"
