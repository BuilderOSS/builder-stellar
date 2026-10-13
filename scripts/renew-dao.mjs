#!/usr/bin/env node
// DAO renewal sweep from the command line (docs/STORAGE_DIET.md § 7): lists every key the DAO owns from
// chain state and extends them in one ExtendFootprintTTL transaction (restoring archived keys first).
// The logic is the app's (apps/web/src/lib/chain-reads/renewal.ts), run through vite-node.
//
// Usage: node scripts/renew-dao.mjs --token <C…> [--network testnet] [--days 90] [--source <identity>] [--dry-run]
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');
const result = spawnSync(
  'pnpm',
  ['exec', 'vite-node', '--config', 'vitest.config.ts', 'src/cli/renew-dao.ts', '--', ...process.argv.slice(2)],
  { cwd: web, stdio: 'inherit' }
);
process.exit(result.status ?? 1);
