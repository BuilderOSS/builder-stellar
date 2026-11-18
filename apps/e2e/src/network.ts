import { Networks } from '@stellar/stellar-sdk';

/** The suite runs on testnet only (§3.3): it is the network with the Goldsky indexer. */
export const TESTNET_RPC_URL = process.env.E2E_RPC_URL?.trim() || 'https://soroban-testnet.stellar.org';
export const TESTNET_PASSPHRASE = Networks.TESTNET;
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/** Where the walkthrough build of apps/web listens (`pnpm --dir apps/e2e build:app`, then Playwright's webServer). */
export const E2E_APP_PORT = Number(process.env.E2E_APP_PORT || 4343);
export const E2E_BASE_URL = process.env.E2E_BASE_URL?.trim() || `http://localhost:${E2E_APP_PORT}`;

/** Contract minimums (§3.3): voting delay, voting period, queue delay and auction duration are each at least 300s. */
export const MIN_GOVERNANCE_STEP_S = 300;

// Never point the suite at production (§3.1): it signs real transactions from test identities.
const PRODUCTION_HOSTS = ['tribes.build', 'www.tribes.build', 'builder-stellar-web.vercel.app'];
if (PRODUCTION_HOSTS.includes(new URL(E2E_BASE_URL).hostname)) {
  throw new Error(`E2E_BASE_URL ${E2E_BASE_URL} is production. Use a local build or a preview URL.`);
}
