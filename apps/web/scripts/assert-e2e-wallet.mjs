#!/usr/bin/env node
// Build assertion for the test-only E2E Wallet (src/lib/e2e-wallet, docs/plans/walkthroughs-and-docs.md
// §13.2). Runs after every `next build`:
//   - without NEXT_PUBLIC_E2E_WALLET=1, the build output must not contain the module's markers;
//   - with it, the markers must be there (which proves the scan looks for the right strings).
// The build directory is NEXT_DIST_DIR (default .next); its `cache` folder is skipped, since it
// holds compiler caches, not shipped code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep in sync with src/lib/e2e-wallet/protocol.ts (a test checks they match).
export const E2E_WALLET_MARKERS = ['e2e_wallet', '__e2eSign'];

const SCANNED = /\.(m?js|cjs|html|json|rsc|map|txt|body|meta)$/;

/** Files under `dir` (minus `cache/`) that contain any marker, with the markers found. */
export function findE2EWalletMarkers(dir, markers = E2E_WALLET_MARKERS) {
  const hits = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        if (current === dir && entry === 'cache') continue;
        walk(path);
      } else if (SCANNED.test(entry)) {
        const text = readFileSync(path, 'utf8');
        const found = markers.filter((marker) => text.includes(marker));
        if (found.length) hits.push({ file: relative(dir, path), markers: found });
      }
    }
  };
  walk(dir);
  return hits;
}

/** Throws when the build does not match the flag. Returns a one-line summary otherwise. */
export function assertE2EWalletBuild({ distDir, enabled }) {
  let hits;
  try {
    hits = findE2EWalletMarkers(distDir);
  } catch (error) {
    throw new Error(`Cannot scan ${distDir} for the E2E Wallet: ${error.message}`);
  }
  if (!enabled && hits.length) {
    const list = hits.map((hit) => `  ${hit.file}: ${hit.markers.join(', ')}`).join('\n');
    throw new Error(
      `The test-only E2E Wallet is in a build made without NEXT_PUBLIC_E2E_WALLET=1:\n${list}\n` +
        'It must never ship. Check the guard in src/lib/wallet-kit.ts.'
    );
  }
  if (enabled && !hits.some((hit) => hit.file.startsWith('static'))) {
    throw new Error(
      `NEXT_PUBLIC_E2E_WALLET=1 but the E2E Wallet is not in the client bundle under ${distDir}/static. ` +
        'The markers in scripts/assert-e2e-wallet.mjs may be out of date.'
    );
  }
  return enabled ? `E2E Wallet present (walkthrough build, ${hits.length} files)` : 'E2E Wallet absent from the build';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = resolve(process.cwd(), process.env.NEXT_DIST_DIR || '.next');
  const enabled = process.env.NEXT_PUBLIC_E2E_WALLET === '1';
  try {
    console.info(`✓ ${assertE2EWalletBuild({ distDir, enabled })}`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
