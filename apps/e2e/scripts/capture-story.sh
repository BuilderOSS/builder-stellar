#!/usr/bin/env bash
# Runs the Lamplight capture story (docs/qa/SHOWCASE_TRIBE.md) in order, one spec at a time, next to
# the founder's driver (capture/90-drive.capture.ts) in a process of its own. Each spec skips what
# fixtures/showcase/state.json says is done, so the script can be run again after a failure.
#   pnpm --dir apps/e2e build:capture   # once
#   bash apps/e2e/scripts/capture-story.sh [spec ...]
set -uo pipefail
cd "$(dirname "$0")/.."
specs=("$@")
[ ${#specs[@]} -eq 0 ] && specs=(01-create 02-setup 04-first-proposal 05-vote 03-auction 06-manage 07-market 08-endings 09-members 11-pages 12-after-votes)
logs=${CAPTURE_LOGS:-reports/capture-logs}
mkdir -p "$logs"
for spec in "${specs[@]}"; do
  echo "== $spec"
  E2E_SKIP_PREFLIGHT=${E2E_SKIP_PREFLIGHT:-0} pnpm capture "capture/$spec.capture.ts" > "$logs/$spec.log" 2>&1
  status=$?
  grep -E "✓|✘|passed|failed|skipped" "$logs/$spec.log" | tail -5
  if [ $status -ne 0 ]; then echo "$spec failed (log: apps/e2e/$logs/$spec.log)"; exit $status; fi
  export E2E_SKIP_PREFLIGHT=1
done
