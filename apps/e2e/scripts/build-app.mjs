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
// E2E_CAPTURE=1: the docs capture build (src/app-env.ts), with real IPFS uploads, into .next-capture.
const capture = process.env.E2E_CAPTURE === '1';
const localEnv = resolve(root, 'apps/e2e/.env.local');
if (capture && existsSync(localEnv)) process.loadEnvFile(localEnv);
if (capture && !process.env.PINATA_JWT) {
  console.error('E2E_CAPTURE=1 needs PINATA_JWT in apps/e2e/.env.local.');
  process.exit(1);
}
const env = {
  ...process.env,
  NEXT_PUBLIC_NETWORK: 'testnet',
  NEXT_PUBLIC_E2E_WALLET: '1',
  NEXT_DIST_DIR: capture ? '.next-capture' : '.next-e2e',
  // The public site the tribes a walkthrough creates point at: their default image and renderer base
  // are written on chain, and they are real tribes on dev.tribes.build. A localhost URL here broke
  // both (and the default image failed "https:// or ipfs://" validation): BUG-W03-1.
  NEXT_PUBLIC_SITE_URL:
    process.env.E2E_SITE_URL?.trim() || process.env.E2E_BASE_URL?.trim() || 'https://dev.tribes.build',
  NEXT_PUBLIC_PINATA_UPLOADS_ENABLED: capture ? 'true' : 'false',
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
// It also adds the build directory's types to tsconfig.json; put that back too.
const restore = ['apps/web/next-env.d.ts', 'apps/web/tsconfig.json'].map((file) => {
  const path = resolve(root, file);
  return { path, before: existsSync(path) ? readFileSync(path, 'utf8') : null };
});
const result = spawnSync('pnpm', ['--dir', resolve(root, 'apps/web'), 'build'], { env, stdio: 'inherit' });
for (const { path, before } of restore) if (before !== null) writeFileSync(path, before);
process.exit(result.status ?? 1);
