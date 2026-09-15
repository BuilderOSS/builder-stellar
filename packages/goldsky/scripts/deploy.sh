#!/bin/bash
#
# Goldsky Pipeline Deployment Script
#
# Usage:
#   ./scripts/deploy.sh [command] [args...]
#
# Commands:
#   deploy        - Deploy pipeline to Goldsky
#   validate      - Validate pipeline configuration
#   status        - Check pipeline deployment status
#   logs          - Tail pipeline logs
#   delete        - Delete pipeline from Goldsky
#   redeploy      - Delete and redeploy pipeline
#
# Environment Variables:
#   GOLDSKY_API_KEY     - Goldsky API key (required)
#   GOLDSKY_SECRET_*    - Pipeline secrets (see setup-env.sh)
#

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
PIPELINE_FILE="$PACKAGE_DIR/pipelines/dao-stellar-events.yaml"

# Load environment
if [ -f "$PACKAGE_DIR/.env" ]; then
  set -a
  source "$PACKAGE_DIR/.env"
  set +a
fi

# Use local Goldsky CLI from devDependencies
GOLDSKY_CMD="pnpm goldsky"

# Verify pnpm is available
if ! command -v pnpm &> /dev/null; then
  echo -e "${RED}Error: pnpm not installed${NC}"
  echo ""
  echo "Install pnpm:"
  echo "  npm install -g pnpm"
  exit 1
fi

# Note: GOLDSKY_API_KEY not required - pnpm goldsky uses authenticated session

# Get pipeline name from goldsky.yaml
PIPELINE_NAME=$(grep "^name:" "$PIPELINE_FILE" | head -1 | sed 's/name: //' | tr -d '"' | tr -d "'")

if [ -z "$PIPELINE_NAME" ]; then
  echo -e "${RED}Error: Could not extract pipeline name from goldsky.yaml${NC}"
  exit 1
fi

#
# Commands
#

cmd_validate() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Validating Goldsky Pipeline${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${YELLOW}→ Pipeline file: $PIPELINE_FILE${NC}"
  echo -e "${YELLOW}→ Pipeline name: $PIPELINE_NAME${NC}"
  echo ""

  # Check file exists
  if [ ! -f "$PIPELINE_FILE" ]; then
    echo -e "${RED}✗ Pipeline file not found${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓ Pipeline file exists${NC}"

  # Validate YAML syntax
  if ! $GOLDSKY_CMD pipeline validate "$PIPELINE_FILE" 2>&1; then
    echo -e "${RED}✗ Pipeline validation failed${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓ Pipeline configuration valid${NC}"
  echo ""
}

cmd_deploy() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Deploying Goldsky Pipeline${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""

  # Validate first
  cmd_validate

  echo -e "${YELLOW}→ Deploying pipeline: $PIPELINE_NAME${NC}"
  echo ""

  # Deploy pipeline
  if ! $GOLDSKY_CMD pipeline apply "$PIPELINE_FILE" 2>&1; then
    echo -e "${RED}✗ Deployment failed${NC}"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}✓ Pipeline deployed successfully${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Check status: ./scripts/deploy.sh status"
  echo "  2. View logs: ./scripts/deploy.sh logs"
  echo ""
}

cmd_status() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Pipeline Status${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${YELLOW}→ Checking status for: $PIPELINE_NAME${NC}"
  echo ""

  $GOLDSKY_CMD pipeline status "$PIPELINE_NAME" 2>&1

  echo ""
}

cmd_logs() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Pipeline Logs${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${YELLOW}→ Tailing logs for: $PIPELINE_NAME${NC}"
  echo -e "${YELLOW}→ Press Ctrl+C to exit${NC}"
  echo ""

  $GOLDSKY_CMD pipeline logs "$PIPELINE_NAME" --follow 2>&1
}

cmd_delete() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Delete Pipeline${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${RED}⚠️  WARNING: This will permanently delete the pipeline${NC}"
  echo -e "${YELLOW}→ Pipeline: $PIPELINE_NAME${NC}"
  echo ""

  read -p "Are you sure? (type 'yes' to confirm): " confirm

  if [ "$confirm" != "yes" ]; then
    echo ""
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
  fi

  echo ""
  echo -e "${YELLOW}→ Deleting pipeline: $PIPELINE_NAME${NC}"

  if ! $GOLDSKY_CMD pipeline delete "$PIPELINE_NAME" 2>&1; then
    echo -e "${RED}✗ Deletion failed${NC}"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}✓ Pipeline deleted${NC}"
  echo ""
}

cmd_redeploy() {
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Redeploy Pipeline${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${YELLOW}→ This will delete and redeploy: $PIPELINE_NAME${NC}"
  echo ""

  read -p "Continue? (type 'yes' to confirm): " confirm

  if [ "$confirm" != "yes" ]; then
    echo ""
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
  fi

  echo ""
  echo -e "${YELLOW}→ Step 1: Deleting existing pipeline${NC}"

  # Try to delete (don't fail if it doesn't exist)
  $GOLDSKY_CMD pipeline delete "$PIPELINE_NAME" 2>&1 || true

  echo ""
  echo -e "${YELLOW}→ Step 2: Deploying new pipeline${NC}"
  echo ""

  cmd_deploy
}

cmd_help() {
  echo "Goldsky Pipeline Deployment Script"
  echo ""
  echo "Usage: $0 [command] [args...]"
  echo ""
  echo "Commands:"
  echo "  deploy        Deploy pipeline to Goldsky"
  echo "  validate      Validate pipeline configuration"
  echo "  status        Check pipeline deployment status"
  echo "  logs          Tail pipeline logs"
  echo "  delete        Delete pipeline from Goldsky"
  echo "  redeploy      Delete and redeploy pipeline"
  echo "  help          Show this help message"
  echo ""
  echo "Environment Variables:"
  echo "  GOLDSKY_API_KEY     Goldsky API key (required)"
  echo "  GOLDSKY_SECRET_*    Pipeline secrets (see setup-env.sh)"
  echo ""
  echo "Examples:"
  echo "  $0 validate"
  echo "  $0 deploy"
  echo "  $0 status"
  echo "  $0 logs"
  echo ""
}

#
# Main
#

COMMAND="${1:-help}"

case "$COMMAND" in
  deploy)
    cmd_deploy
    ;;
  validate)
    cmd_validate
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs
    ;;
  delete)
    cmd_delete
    ;;
  redeploy)
    cmd_redeploy
    ;;
  help|--help|-h)
    cmd_help
    ;;
  *)
    echo -e "${RED}Error: Unknown command '$COMMAND'${NC}"
    echo ""
    cmd_help
    exit 1
    ;;
esac
