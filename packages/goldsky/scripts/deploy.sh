#!/bin/bash
#
# Goldsky Turbo pipeline deployment.
#
# Usage:
#   ./scripts/deploy.sh [command]
#
# Commands:
#   validate      - Validate the generated pipeline file
#   deploy        - Apply the pipeline (create or update)
#   status        - Show the deployed Turbo pipelines
#   logs          - Tail the pipeline logs
#   delete        - Delete the pipeline
#   redeploy      - Delete and apply again (see the replay notes below).
#                   Refuses while the read model still holds events unless
#                   --force is given, because a replay cannot overwrite the
#                   immutable landing tables; with DATABASE_URL set the check
#                   is real (SELECT 1 FROM chain.raw_events), without it the
#                   script cannot tell and also wants --force.
#
# The pipeline is a Goldsky *Turbo* pipeline. Its name is the `name:` line of
# pipelines/builder-stellar-events.yaml (`builder-stellar-<network>`, set by
# `pnpm generate` from the Manager artifact or GOLDSKY_PIPELINE_NAME). The legacy
# `goldsky pipeline ...` commands do not see Turbo pipelines.
#
# The CLI is the global `goldsky` (curl https://goldsky.com | sh; `goldsky login`).
# Database credentials are not passed here: the pipeline reads the Goldsky secret
# named in the YAML (GOLDSKY_POSTGRES_SECRET, default DAO_POSTGRES).
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
PIPELINE_FILE="$PACKAGE_DIR/pipelines/builder-stellar-events.yaml"

for env_file in "$PACKAGE_DIR/.env" "$PACKAGE_DIR/.env.local"; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
done

if ! command -v goldsky &> /dev/null; then
  echo -e "${RED}Error: goldsky CLI not installed${NC}"
  echo "  curl https://goldsky.com | sh && goldsky login"
  exit 1
fi

if [ ! -f "$PIPELINE_FILE" ]; then
  echo -e "${RED}✗ Pipeline file not found: $PIPELINE_FILE (run pnpm generate)${NC}"
  exit 1
fi

PIPELINE_NAME=$(grep "^name:" "$PIPELINE_FILE" | head -1 | sed 's/name: //' | tr -d '"' | tr -d "'")

if [ -z "$PIPELINE_NAME" ]; then
  echo -e "${RED}Error: Could not read the pipeline name from $PIPELINE_FILE${NC}"
  exit 1
fi

banner() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""
}

cmd_validate() {
  banner "Validating Turbo pipeline"
  echo -e "${YELLOW}→ Pipeline file: $PIPELINE_FILE${NC}"
  echo -e "${YELLOW}→ Pipeline name: $PIPELINE_NAME${NC}"
  echo ""

  if ! goldsky turbo validate "$PIPELINE_FILE" 2>&1; then
    echo -e "${RED}✗ Pipeline validation failed${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓ Pipeline configuration valid${NC}"
  echo ""
}

cmd_deploy() {
  banner "Applying Turbo pipeline"
  cmd_validate

  echo -e "${YELLOW}→ Applying pipeline: $PIPELINE_NAME${NC}"
  echo ""

  if ! goldsky turbo apply "$PIPELINE_FILE" 2>&1; then
    echo -e "${RED}✗ Apply failed${NC}"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}✓ Pipeline applied${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Status: ./scripts/deploy.sh status"
  echo "  2. Logs:   ./scripts/deploy.sh logs"
  echo "  3. Verify the read model with the queries in README.md (Redeploy checklist)"
  echo ""
}

cmd_status() {
  banner "Turbo pipelines"
  echo -e "${YELLOW}→ Expecting: $PIPELINE_NAME${NC}"
  echo ""
  goldsky turbo list 2>&1
  echo ""
}

cmd_logs() {
  banner "Pipeline logs"
  echo -e "${YELLOW}→ Tailing logs for: $PIPELINE_NAME (Ctrl+C to exit)${NC}"
  echo ""
  goldsky turbo logs "$PIPELINE_NAME" --follow 2>&1
}

cmd_delete() {
  banner "Delete Turbo pipeline"
  echo -e "${RED}⚠️  This permanently deletes the pipeline${NC}"
  echo -e "${YELLOW}→ Pipeline: $PIPELINE_NAME${NC}"
  echo ""

  read -r -p "Are you sure? (type 'yes' to confirm): " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
  fi

  echo ""
  if ! goldsky turbo delete "$PIPELINE_NAME" 2>&1; then
    echo -e "${RED}✗ Deletion failed${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Pipeline deleted${NC}"
  echo ""
}

# A redeploy replays the chain into the landing tables, which reject updates
# (chain.reject_event_mutation). Replaying over a populated read model either
# duplicates nothing (same ids, rows refused) or, after a changed transform,
# leaves old rows next to new ones. Refuse unless the database is empty or the
# operator says --force.
redeploy_guard() {
  if [ "$FORCE" = "1" ]; then
    echo -e "${YELLOW}--force: skipping the empty-read-model check${NC}"
    return 0
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    echo -e "${RED}✗ DATABASE_URL is not set, so the read model cannot be checked for leftover events.${NC}"
    echo "  Set DATABASE_URL (admin role) or pass --force after resetting the database yourself."
    exit 1
  fi
  if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ psql not installed; cannot check the read model. Pass --force after resetting it yourself.${NC}"
    exit 1
  fi
  local populated
  populated=$(psql "$DATABASE_URL" -X -t -A -c "SELECT EXISTS (SELECT 1 FROM chain.raw_events)" 2>/dev/null || echo "")
  if [ "$populated" = "t" ]; then
    echo -e "${RED}✗ chain.raw_events still holds events. A replay cannot overwrite them.${NC}"
    echo "  With the pipeline stopped: DROP SCHEMA streamling CASCADE; db/reset-database.sh --yes && db/migrate.sh && db/grant-permissions.sh"
    echo "  then run redeploy again (or pass --force to skip this check)."
    exit 1
  fi
  if [ "$populated" != "f" ]; then
    echo -e "${YELLOW}chain.raw_events is absent (fresh database): continuing${NC}"
  fi
}

cmd_redeploy() {
  banner "Redeploy Turbo pipeline"
  echo -e "${YELLOW}→ This deletes and re-applies: $PIPELINE_NAME${NC}"
  redeploy_guard
  echo ""
  echo -e "${YELLOW}The landing tables (chain.raw_events, chain.decoded_events, app.activity_feed_events)${NC}"
  echo -e "${YELLOW}are immutable, and the DAO allowlists in schema streamling persist across pipelines.${NC}"
  echo -e "${YELLOW}A changed transform or a new Manager needs, with the pipeline stopped:${NC}"
  echo "  DROP SCHEMA streamling CASCADE;  then  db/reset-database.sh --yes && db/migrate.sh && db/grant-permissions.sh"
  echo -e "${YELLOW}(see db/README.md) so the replay starts from an empty read model.${NC}"
  echo ""

  read -r -p "Continue? (type 'yes' to confirm): " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
  fi

  echo ""
  echo -e "${YELLOW}→ Step 1: deleting the existing pipeline (ignored if absent)${NC}"
  goldsky turbo delete "$PIPELINE_NAME" 2>&1 || true

  echo ""
  echo -e "${YELLOW}→ Step 2: applying the new pipeline${NC}"
  echo ""
  cmd_deploy
}

cmd_help() {
  echo "Goldsky Turbo pipeline deployment"
  echo ""
  echo "Usage: $0 [command]"
  echo ""
  echo "Commands:"
  echo "  validate      Validate pipelines/builder-stellar-events.yaml"
  echo "  deploy        Apply the pipeline (create or update)"
  echo "  status        List the deployed Turbo pipelines"
  echo "  logs          Tail the pipeline logs"
  echo "  delete        Delete the pipeline"
  echo "  redeploy      Delete and apply again; refuses over a populated read model unless --force"
  echo "  help          Show this help"
  echo ""
  echo "Pipeline name: $PIPELINE_NAME (from the YAML; pnpm generate sets it)"
}

COMMAND="${1:-help}"
FORCE=0
for arg in "${@:2}"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo -e "${RED}Error: Unknown option '$arg'${NC}"; exit 1 ;;
  esac
done

case "$COMMAND" in
  deploy) cmd_deploy ;;
  validate) cmd_validate ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  delete) cmd_delete ;;
  redeploy) cmd_redeploy ;;
  help|--help|-h) cmd_help ;;
  *)
    echo -e "${RED}Error: Unknown command '$COMMAND'${NC}"
    echo ""
    cmd_help
    exit 1
    ;;
esac
