import { expect, type Page } from '@playwright/test';

import type { E2ESigner } from './wallet/signer.ts';
import { waitForVisible } from './waits.ts';

/** The top bar's Connect (W01 covers the intro and the refusals; flows just need a session). */
export const topBarConnect = (page: Page) => page.getByRole('button', { name: 'Connect wallet' }).first();
export const youButton = (page: Page) => page.getByRole('button', { name: /^You, connected as/ });

/** The kit's own modal: pick the E2E Wallet like any other wallet. */
export async function pickE2EWallet(page: Page) {
  const option = page.getByText('E2E Wallet', { exact: true });
  await waitForVisible(option, 'E2E Wallet listed in the wallet modal');
  await option.click();
}

/**
 * Connect and sign in (SEP-53) as `identity` from the page that is open. The wallet's account is
 * switched first, like picking another account in a real wallet before connecting.
 */
export async function signInAs(page: Page, wallet: E2ESigner, identity: string) {
  wallet.use(identity);
  await waitForVisible(topBarConnect(page), 'top bar Connect');
  await topBarConnect(page).click();
  await pickE2EWallet(page);
  await waitForVisible(youButton(page), `signed in as ${identity}`);
  const response = await page.request.get('/api/auth/session');
  expect(await response.json()).toMatchObject({ authenticated: true, address: wallet.address });
}

/** Transactions the signer signed for `identity` so far (Sign and send presses that reached the wallet). */
export function signedTransactions(wallet: E2ESigner, identity: string) {
  return wallet.calls.filter(
    (call) => call.method === 'signTransaction' && call.outcome === 'ok' && call.identity === identity
  ).length;
}
