'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { allowedWallets } from '@creit.tech/stellar-wallets-kit/state';

/**
 * Opens the kit's connect modal.
 *
 * Stellar Wallets Kit 2.6 renders the wallet list, then re-checks every wallet (up to 1s each)
 * before it listens for the pick. On a first connect the list says "Loading wallets..." meanwhile.
 * On a later one (after a refused signature, or a sign-out) the previous list shows at once, so a
 * quick pick fired before the kit listened and the modal hung on "Check wallet" (BUG-004 in
 * docs/qa/BUG_LEDGER.md). Clearing the cached list keeps the loading state up until the kit listens.
 */
export function openConnectModal(): ReturnType<typeof StellarWalletsKit.authModal> {
  allowedWallets.value = [];
  return StellarWalletsKit.authModal();
}
