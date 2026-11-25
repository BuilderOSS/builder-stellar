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
SCHEMAS=(chain manager token governance auction metadata treasury marketplace claims app)
# Schemas the web app may read. chain holds raw landing payloads and is never
# exposed; app/manager/... views read it with owner privileges.
APP_SCHEMAS=(manager token governance auction metadata treasury marketplace claims app)

# Comma-separated, quoted list for SQL IN (...) clauses.
sql_schema_list() {
  local out="" s
  for s in "${SCHEMAS[@]}"; do out+="'$s',"; done
  echo "${out%,}"
}

# The same for the app-readable schemas.
sql_app_schema_list() {
  local out="" s
  for s in "${APP_SCHEMAS[@]}"; do out+="'$s',"; done
  echo "${out%,}"
}

# ---------------------------------------------------------------------------
# Connections. The scripts read the URL from DATABASE_URL only and hand it to
# psql as a libpq service file plus a password file, both in a private
# temporary directory that is removed on exit. A URL on a command line (ours or
# psql's) is visible to every local user through `ps`, password included.
# ---------------------------------------------------------------------------
DB_CONN_DIR=""

db_cleanup() {
  if [ -n "$DB_CONN_DIR" ]; then rm -rf "$DB_CONN_DIR"; fi
  DB_CONN_DIR=""
}
trap db_cleanup EXIT

# Percent-decode one URL component. Backslashes are doubled first, so printf
# expands only the \xHH sequences made here.
url_decode() {
  local s="${1//\\/\\\\}"
  printf '%b' "${s//%/\\x}"
}

# Escape a value for one field of a libpq password file (backslash and colon).
pgpass_escape() {
  local s="${1//\\/\\\\}"
  printf '%s' "${s//:/\\:}"
}

# Write the service file and password file for a postgres:// URL into a new
# directory under $2 and print that directory. The service file holds host,
# port, dbname, user and every query parameter (sslmode and so on); the
# password goes only into the password file.
db_conn_files() {
  local url="$1" base="$2" rest auth="" query="" hosts path user="" pass="" dir
  local host_list="" port_list="" entry h p pair k v
  local -a entries=() pairs=()
  case "$url" in
    postgres://* | postgresql://*) ;;
    *) echo -e "${RED}Error: DATABASE_URL must be a postgres:// or postgresql:// URL${NC}" >&2; return 1 ;;
  esac
  if [[ "$url" == *$'\n'* ]]; then
    echo -e "${RED}Error: DATABASE_URL contains a line break${NC}" >&2; return 1
  fi
  rest="${url#*://}"
  if [[ "$rest" == *\?* ]]; then query="${rest#*\?}"; rest="${rest%%\?*}"; fi
  # The user information ends at the last @, so an unencoded @ in a password still parses.
  if [[ "$rest" == *@* ]]; then auth="${rest%@*}"; rest="${rest##*@}"; fi
  hosts="${rest%%/*}"
  path=""
  if [[ "$rest" == */* ]]; then path="${rest#*/}"; fi
  if [ -n "$auth" ]; then
    if [[ "$auth" == *:* ]]; then
      user="$(url_decode "${auth%%:*}")"
      pass="$(url_decode "${auth#*:}")"
    else
      user="$(url_decode "$auth")"
    fi
  fi

  # host[:port] entries, comma-separated (libpq multi-host), IPv6 in brackets.
  [ -n "$hosts" ] && IFS=',' read -r -a entries <<< "$hosts"
  for entry in ${entries[@]+"${entries[@]}"}; do
    h="$entry"; p=""
    if [[ "$entry" == \[* ]]; then
      h="${entry%%]*}"; h="${h#\[}"
      [[ "$entry" == *]:* ]] && p="${entry##*]:}"
    elif [[ "$entry" == *:* ]]; then
      h="${entry%%:*}"; p="${entry#*:}"
    fi
    host_list+="$h,"
    port_list+="$p,"
  done

  # Each setting appears once: libpq lets a repeated URL parameter win, a service
  # file keeps the first line, so a repeat (?port=, ?dbname=) could send the
  # connection somewhere the displayed target doesn't show. hostaddr, service and
  # passfile would do the same, and a decoded control character could add lines.
  local lines="" seen=" "
  add_setting() {
    if [[ "$2" == *[[:cntrl:]]* ]]; then
      echo -e "${RED}Error: DATABASE_URL has a control character in its $1${NC}" >&2; return 1
    fi
    case "$1" in
      hostaddr | service | servicefile | passfile)
        echo -e "${RED}Error: DATABASE_URL may not set $1${NC}" >&2; return 1 ;;
    esac
    if [[ "$seen" == *" $1 "* ]]; then
      echo -e "${RED}Error: DATABASE_URL sets $1 more than once${NC}" >&2; return 1
    fi
    seen+="$1 "
    lines+="$1=$2"$'\n'
  }
  if [ -n "${host_list//,/}" ]; then add_setting host "$(url_decode "${host_list%,}")" || return 1; fi
  if [ -n "${port_list//,/}" ]; then add_setting port "${port_list%,}" || return 1; fi
  if [ -n "$path" ]; then add_setting dbname "$(url_decode "$path")" || return 1; fi
  if [ -n "$user" ]; then add_setting user "$user" || return 1; fi
  if [[ "$pass" == *[[:cntrl:]]* ]]; then
    echo -e "${RED}Error: DATABASE_URL has a control character in its password${NC}" >&2; return 1
  fi
  if [ -n "$query" ]; then
    IFS='&' read -r -a pairs <<< "$query"
    for pair in ${pairs[@]+"${pairs[@]}"}; do
      [ -n "$pair" ] || continue
      k="$(url_decode "${pair%%=*}")"
      v=""
      [[ "$pair" == *=* ]] && v="$(url_decode "${pair#*=}")"
      add_setting "$k" "$v" || return 1
    done
  fi

  dir="$(mktemp -d "$base/conn.XXXXXX")"
  chmod 700 "$dir"
  (
    umask 077
    printf '[db]\n%s' "$lines" > "$dir/service"
    if [ -n "$pass" ]; then
      printf '*:*:*:*:%s\n' "$(pgpass_escape "$pass")" > "$dir/pass"
    fi
  )
  echo "$dir"
}

# libpq variables that choose where a connection goes. use_database_url clears
# them, so only the URL decides the target.
PG_TARGET_VARS=(PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGPASSFILE PGREQUIRESSL PGTARGETSESSIONATTRS)

# Point every later psql call in this shell at a URL: PGSERVICEFILE and
# PGSERVICE select the service file, PGPASSFILE the password (when the URL has
# one). The other libpq target variables are cleared first, so a stray PGHOSTADDR
# or PGPORT can't send a script somewhere the URL doesn't name.
use_database_url() {
  local dir
  if [ -z "$DB_CONN_DIR" ]; then
    DB_CONN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/db-conn.XXXXXX")"
    chmod 700 "$DB_CONN_DIR"
  fi
  dir="$(db_conn_files "$1" "$DB_CONN_DIR")" || return 1
  unset "${PG_TARGET_VARS[@]}"
  export PGSERVICEFILE="$dir/service" PGSERVICE=db
  if [ -f "$dir/pass" ]; then export PGPASSFILE="$dir/pass"; fi
}

# What the destructive scripts ask for: the database name and the host's first
# label (a Neon endpoint ID, say), joined by @. Dev and production branches of one
# Neon project share the database name neondb, so the name alone can't tell them
# apart. An IP address or a socket path is used whole.
confirm_target_name() {
  local host
  host="$(sed -n 's/^host=//p' "$PGSERVICEFILE" | head -n 1)"
  host="${host%%,*}"
  if [ -z "$host" ]; then host="localhost"
  elif [[ "$host" != */* && ! "$host" =~ ^[0-9.]+$ && "$host" != *:* ]]; then host="${host%%.*}"; fi
  echo "$1@$host"
}

# Resolve the target from DATABASE_URL, point psql at it and verify the
# connection. A URL given as an argument is refused: it would sit in the
# process list for the whole run.
require_database() {
  if [ -n "${1:-}" ]; then
    echo -e "${RED}Error: pass the database URL in DATABASE_URL, not as an argument${NC}" >&2
    echo "  (arguments are visible to every local user through ps, password included)" >&2
    exit 1
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    echo -e "${RED}Error: DATABASE_URL not set${NC}" >&2
    echo "Usage: DATABASE_URL=postgres://user:pass@host:5432/dbname $0" >&2
    exit 1
  fi
  command -v psql > /dev/null || { echo -e "${RED}Error: psql is not installed${NC}" >&2; exit 1; }
  DB_TARGET="$(redact_url "$DATABASE_URL")"
  use_database_url "$DATABASE_URL" || exit 1
  # psql runs from the service file from here on; the URL stays out of its environment.
  unset DATABASE_URL
  psql -Atc "SELECT 1" > /dev/null 2>&1 || {
    echo -e "${RED}✗ Failed to connect to database${NC}" >&2
    exit 1
  }
  DB_NAME="$(psql -Atc "SELECT current_database()")"
}

# The URL for display: user information (up to the last @, as the parser reads
# it) and any password= parameter replaced.
redact_url() {
  local scheme="${1%%://*}" rest="${1#*://}" query=""
  if [[ "$rest" == *\?* ]]; then query="?${rest#*\?}"; rest="${rest%%\?*}"; fi
  if [[ "$rest" == *@* ]]; then rest="<redacted>@${rest##*@}"; fi
  echo "$scheme://$rest$(echo "$query" | sed -E 's#(password=)[^&]*#\1<redacted>#g')"
}

# Destructive scripts (rollback, reset) ask for the database name and host label,
# typed in full: a --yes flag or a habit of typing "yes" doesn't show which
# database the operator is about to change. --confirm-database <database>@<host>
# is the non-interactive form and must name the database the URL connects to.
confirm_database() {
  local confirmed="$1" action="$2" typed deployments expected
  echo "Target: $DB_TARGET"
  echo "Database: $DB_NAME"
  # Which deployments' events this database holds, so dev and prod can be told apart.
  deployments="$(psql -Atc "SELECT string_agg(deployment_id || ' (' || n || ' events)', ', ' ORDER BY deployment_id)
    FROM (SELECT deployment_id, count(*) AS n FROM chain.raw_events GROUP BY deployment_id) d" 2>/dev/null || true)"
  echo "Indexed deployments: ${deployments:-none}"
  expected="$(confirm_target_name "$DB_NAME")"
  if [ -n "$confirmed" ]; then
    if [ "$confirmed" != "$expected" ]; then
      echo -e "${RED}✗ --confirm-database '$confirmed' does not name the connected database and host${NC}" >&2
      exit 1
    fi
    return 0
  fi
  if [ ! -t 0 ]; then
    echo -e "${RED}✗ Refusing to $action without a terminal: pass --confirm-database <database>@<host label>${NC}" >&2
    exit 1
  fi
  read -r -p "Type $expected (database@host) to $action: " typed
  [ "$typed" = "$expected" ] || { echo "Cancelled: '$typed' is not '$expected'"; exit 1; }
}

migration_checksum() {
  if command -v sha256sum > /dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
