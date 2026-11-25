#!/bin/bash
#
# Create the database roles the pipeline and the app log in as:
#   goldsky_writer  the Goldsky pipeline (landing tables, streamling allowlists)
#   app_server      the web app (read-only views)
#
#   DATABASE_URL=postgres://<owner>@host/db ./db/setup-roles.sh
#       Create the missing roles and ask for each new role's password.
#   DATABASE_URL=postgres://<owner>@host/db ./db/setup-roles.sh --rotate <role>
#       Set a new password for an existing role (docs/KEY_CUSTODY.md).
#
# Each password is typed at psql's own prompt (\password). psql hashes it
# (SCRAM-SHA-256) before it leaves this machine, so the plain password is never
# in a shell variable, on a command line, in SQL text the server could log, or
# in this script's output. Store it where docs/KEY_CUSTODY.md says.
#
# Run as the database owner. Then ./db/migrate.sh and ./db/grant-permissions.sh.
#
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CYAN='\033[0;36m'
ROLES=(goldsky_writer app_server)

usage() {
  echo "Usage: DATABASE_URL=postgres://... $0 [--rotate goldsky_writer|app_server]" >&2
  exit 1
}

rotate=""
case "${1:-}" in
  "") ;;
  --rotate)
    rotate="${2:-}"
    [[ " ${ROLES[*]} " == *" $rotate "* ]] || usage ;;
  *) usage ;;
esac

require_database
if [ ! -t 0 ]; then
  echo -e "${RED}Error: run this from a terminal: psql asks for each password${NC}" >&2
  exit 1
fi
echo -e "${BLUE}Database roles on $DB_TARGET${NC}"

# psql prompts twice on the terminal and sends only the SCRAM verifier.
set_password() {
  echo -e "${CYAN}New password for $1 (typed twice; nothing is shown or saved):${NC}"
  psql -v ON_ERROR_STOP=1 -q -c "\\password $1"
}

role_state() {
  psql -Atc "SELECT CASE WHEN rolcanlogin THEN 'login' ELSE 'nologin' END FROM pg_roles WHERE rolname = '$1'"
}

if [ -n "$rotate" ]; then
  [ -n "$(role_state "$rotate")" ] || { echo -e "${RED}✗ role $rotate does not exist${NC}" >&2; exit 1; }
  set_password "$rotate"
  echo -e "${GREEN}✓ New password set for $rotate${NC}"
  echo "Next: update the secret that holds it (docs/KEY_CUSTODY.md), then check the pipeline or app reconnects."
  exit 0
fi

for role in "${ROLES[@]}"; do
  state="$(role_state "$role")"
  if [ "$state" = "login" ]; then
    echo -e "  ${BLUE}$role exists${NC} (to set a new password: $0 --rotate $role)"
    continue
  fi
  if [ -z "$state" ]; then
    # Created without LOGIN, so the role can't be used until its password is set.
    psql -v ON_ERROR_STOP=1 -q -c "CREATE ROLE $role NOLOGIN"
  fi
  set_password "$role"
  psql -v ON_ERROR_STOP=1 -q -c "ALTER ROLE $role LOGIN"
  echo -e "  ${GREEN}✓ $role created${NC}"
done

# Database grants, on every run. goldsky_writer's CREATE on the database is what
# the Goldsky sink needs for CREATE SCHEMA IF NOT EXISTS; grant-permissions.sh
# installs the guard that limits it to the streamling schema.
psql -v ON_ERROR_STOP=1 -q <<'SQL'
SELECT format('GRANT CONNECT ON DATABASE %I TO goldsky_writer, app_server', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO goldsky_writer', current_database()) \gexec
SQL

host="$(sed -n 's/^host=//p' "$PGSERVICEFILE")"
port="$(sed -n 's/^port=//p' "$PGSERVICEFILE")"
echo ""
echo -e "${CYAN}Connection settings (fill in each password from where you stored it):${NC}"
echo "  goldsky_writer: host ${host:-localhost}, port ${port:-5432}, database $DB_NAME"
echo "  app_server:     postgres://app_server:<password>@${host:-localhost}${port:+:$port}/$DB_NAME?sslmode=require"
echo ""
echo "Next: ./db/migrate.sh, then ./db/grant-permissions.sh"
