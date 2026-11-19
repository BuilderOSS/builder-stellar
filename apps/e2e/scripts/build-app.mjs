#!/usr/bin/env node
// pnpm --dir apps/e2e build:app
// Builds apps/web for the walkthrough suite: testnet, the E2E Wallet on, into apps/web/.next-e2e
// (the normal .next is left alone). The web build's own assertion then checks the wallet is in it.
// When the dev Manager artifact exists, the build indexes that Manager instead of the public one.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const artifact = process.env.E2E_MANAGER_ARTIFACT?.trim() || 'deploys/dev-testnet-manager.json';
const env = {
  ...process.env,
  NEXT_PUBLIC_NETWORK: 'testnet',
  NEXT_PUBLIC_E2E_WALLET: '1',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_PUBLIC_SITE_URL: process.env.E2E_BASE_URL?.trim() || `http://localhost:${process.env.E2E_APP_PORT || 4343}`,
  NEXT_PUBLIC_PINATA_UPLOADS_ENABLED: 'false',
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: ''
};
if (existsSync(resolve(root, artifact))) {
  env.MANAGER_DEPLOYMENT_FILE = artifact;
  console.info(`Walkthrough build indexes the dev Manager (${artifact}).`);
} else {
  console.info(
    `No ${artifact}: the walkthrough build uses the public testnet Manager (auth and read-only flows only).`
  );
}
// `build` runs codegen first (prebuild), then next build, then scripts/assert-e2e-wallet.mjs.
// next build rewrites the tracked next-env.d.ts to point at the build directory; put it back.
const nextEnv = resolve(root, 'apps/web/next-env.d.ts');
const nextEnvBefore = existsSync(nextEnv) ? readFileSync(nextEnv, 'utf8') : null;
const result = spawnSync('pnpm', ['--dir', resolve(root, 'apps/web'), 'build'], { env, stdio: 'inherit' });
if (nextEnvBefore !== null) writeFileSync(nextEnv, nextEnvBefore);
process.exit(result.status ?? 1);
