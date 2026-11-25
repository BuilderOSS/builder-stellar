import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { E2E_WEB_AUTH_IDENTITY, loadIdentity } from './identities.ts';
import { E2E_APP_PORT, E2E_BASE_URL, E2E_SITE_URL } from './network.ts';
import { E2E_ROOT } from './run.ts';

/**
 * The docs capture build (`E2E_CAPTURE=1`, docs/qa/SHOWCASE_TRIBE.md) turns real IPFS uploads on, so
 * the showcase tribe's artwork and image are pinned and the upload steps can be photographed. It needs
 * PINATA_JWT in apps/e2e/.env.local; it builds into its own directory.
 */
export const E2E_CAPTURE = process.env.E2E_CAPTURE === '1';

/** Build-time flags for the walkthrough build of apps/web (inlined by Next, so they must be set at build). */
export const E2E_BUILD_ENV = {
  NEXT_PUBLIC_NETWORK: 'testnet',
  NEXT_PUBLIC_E2E_WALLET: '1',
  NEXT_DIST_DIR: E2E_CAPTURE ? '.next-capture' : '.next-e2e',
  NEXT_PUBLIC_SITE_URL: E2E_SITE_URL,
  NEXT_PUBLIC_PINATA_UPLOADS_ENABLED: E2E_CAPTURE ? 'true' : 'false',
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: ''
} as const;

/** apps/e2e/.env.local (gitignored) holds APP_DATABASE_URL for the e2e read model, if any. */
export function loadLocalEnv() {
  const path = join(E2E_ROOT, '.env.local');
  if (existsSync(path)) process.loadEnvFile(path);
}

/**
 * Runtime env for `next start`. The SEP-53/SEP-10 server key is the e2e-web-auth identity; the
 * session password is fresh per run. Nothing here is printed.
 */
export function appServerEnv(): Record<string, string> {
  loadLocalEnv();
  const env: Record<string, string> = {
    ...E2E_BUILD_ENV,
    PORT: String(E2E_APP_PORT),
    APP_URL: E2E_BASE_URL,
    IRON_PASSWORD: randomBytes(32).toString('hex'),
    STELLAR_WEB_AUTH_SECRET: loadIdentity(E2E_WEB_AUTH_IDENTITY, undefined, { create: true }).keypair.secret(),
    STELLAR_HOME_DOMAIN: 'localhost',
    STELLAR_WEB_AUTH_DOMAIN: 'localhost',
    AUTH_APP_NAME: 'Tribe Builder',
    // Each test sends its own X-Forwarded-For (fixtures.ts) so sign-in limits count per test. Off
    // Vercel the app trusts a client address header only when it is named here.
    TRUSTED_CLIENT_IP_HEADER: 'x-forwarded-for'
  };
  if (process.env.APP_DATABASE_URL) env.APP_DATABASE_URL = process.env.APP_DATABASE_URL;
  if (E2E_CAPTURE) {
    if (!process.env.PINATA_JWT) throw new Error('E2E_CAPTURE=1 needs PINATA_JWT in apps/e2e/.env.local.');
    env.PINATA_JWT = process.env.PINATA_JWT;
    if (process.env.NEXT_PUBLIC_PINATA_GATEWAY) env.NEXT_PUBLIC_PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  }
  return env;
}
