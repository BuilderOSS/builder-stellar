import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { E2E_WEB_AUTH_IDENTITY, loadIdentity } from './identities.ts';
import { E2E_APP_PORT, E2E_BASE_URL } from './network.ts';
import { E2E_ROOT } from './run.ts';

/** Build-time flags for the walkthrough build of apps/web (inlined by Next, so they must be set at build). */
export const E2E_BUILD_ENV = {
  NEXT_PUBLIC_NETWORK: 'testnet',
  NEXT_PUBLIC_E2E_WALLET: '1',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
  NEXT_PUBLIC_PINATA_UPLOADS_ENABLED: 'false',
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
    AUTH_APP_NAME: 'Tribe Builder'
  };
  if (process.env.APP_DATABASE_URL) env.APP_DATABASE_URL = process.env.APP_DATABASE_URL;
  return env;
}
