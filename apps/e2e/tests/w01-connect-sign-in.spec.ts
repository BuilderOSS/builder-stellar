import type { Page } from '@playwright/test';

import { appliedTheme, expect, expectNoHorizontalScroll, test } from '../src/fixtures.ts';
import { waitForVisible } from '../src/waits.ts';

/**
 * W01 · Connect a wallet, sign in with SEP-53, sign out, and refuse a signature (§3.4). Also the
 * SEP-10 fallback for a wallet without signMessage. Runs at every viewport × theme (@matrix).
 */

type Session = { authenticated: boolean; address: string | null; authMethod?: string };

async function session(page: Page): Promise<Session> {
  const response = await page.request.get('/api/auth/session');
  expect(response.ok()).toBe(true);
  return (await response.json()) as Session;
}

const connectButton = (page: Page) => page.getByRole('button', { name: 'Connect wallet' }).first();
const youButton = (page: Page) => page.getByRole('button', { name: /^You, connected as/ });

/** The kit's own modal: pick the E2E Wallet like any other wallet. */
async function pickE2EWallet(page: Page) {
  const option = page.getByText('E2E Wallet', { exact: true });
  await waitForVisible(option, 'E2E Wallet listed in the wallet modal');
  await option.click();
}

async function openHome(page: Page, theme: string) {
  await page.goto('/');
  expect(await appliedTheme(page)).toBe(theme);
  await expect(connectButton(page)).toBeVisible();
}

test.describe('W01 first connect', { tag: ['@matrix', '@smoke'] }, () => {
  test.use({ skipWalletIntro: false });

  test('shows the wallet intro, then signs in with SEP-53', async ({ page, wallet, theme }) => {
    await openHome(page, theme);
    await expectNoHorizontalScroll(page);

    await connectButton(page).click();
    const intro = page.getByRole('dialog', { name: 'Before you connect' });
    await waitForVisible(intro, 'wallet intro');
    await intro.getByRole('button', { name: 'Connect wallet' }).click();
    await pickE2EWallet(page);

    await waitForVisible(youButton(page), 'signed-in top bar');
    await expect(session(page)).resolves.toMatchObject({
      authenticated: true,
      address: wallet.address,
      authMethod: 'sep53'
    });
    expect(wallet.calls.map((call) => `${call.method}:${call.outcome}`)).toContain('signMessage:ok');
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('W01 connect and sign in', { tag: ['@matrix', '@smoke'] }, () => {
  test('signs out from the You sheet', async ({ page, wallet, theme }) => {
    await openHome(page, theme);
    await connectButton(page).click();
    await pickE2EWallet(page);
    await waitForVisible(youButton(page), 'signed-in top bar');

    await youButton(page).click();
    const you = page.getByRole('dialog');
    await expect(you.getByText(`Connected on Testnet`)).toBeVisible();
    await you.getByRole('button', { name: 'Disconnect' }).click();

    await waitForVisible(connectButton(page), 'signed-out top bar');
    await expect(session(page)).resolves.toMatchObject({ authenticated: false });
    // Signed out stays signed out after a reload.
    await page.reload();
    await expect(connectButton(page)).toBeVisible();
    await expect(session(page)).resolves.toMatchObject({ authenticated: false });
    expect(wallet.address).not.toBeNull();
  });

  test('a refused signature leaves you signed out with an explanation', async ({ page, wallet, theme }) => {
    wallet.rejectNext('signMessage');
    await openHome(page, theme);
    await connectButton(page).click();
    await pickE2EWallet(page);

    const toast = page.getByText("Couldn't connect your wallet");
    await waitForVisible(toast, 'sign-in error toast');
    // BUG-003: the refusal is named, not "Wallet sign-in failed."
    await expect(page.getByText("You declined the request in your wallet, so you're not signed in.")).toBeVisible();
    await expect(connectButton(page)).toBeVisible();
    await expect(session(page)).resolves.toMatchObject({ authenticated: false });
    // A refusal is not "unsupported": no SEP-10 fallback was attempted.
    expect(wallet.calls.map((call) => `${call.method}:${call.outcome}`)).toContain('signMessage:rejected');
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);

    // And the next attempt works.
    await connectButton(page).click();
    await pickE2EWallet(page);
    await waitForVisible(youButton(page), 'signed-in top bar after retry');
    await expect(session(page)).resolves.toMatchObject({ authenticated: true, authMethod: 'sep53' });
  });

  test('falls back to SEP-10 for a wallet without signMessage', async ({ page, wallet, theme }) => {
    wallet.unsupportedNext('signMessage');
    await openHome(page, theme);
    await connectButton(page).click();
    await pickE2EWallet(page);

    await waitForVisible(youButton(page), 'signed-in top bar (SEP-10)');
    await expect(session(page)).resolves.toMatchObject({
      authenticated: true,
      address: wallet.address,
      authMethod: 'sep10'
    });
    expect(wallet.calls.map((call) => `${call.method}:${call.outcome}`)).toEqual(
      expect.arrayContaining(['signMessage:rejected', 'signTransaction:ok'])
    );
  });
});
