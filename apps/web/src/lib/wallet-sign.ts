'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';

import { useAuthSessionStore } from '@/stores/auth-session-store';

export class WalletNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletNetworkError';
  }
}

/** Throws when the connected wallet reported a different network. */
export function assertWalletNetworkReady() {
  const issue = useAuthSessionStore.getState().walletNetworkIssue;
  if (issue) throw new WalletNetworkError(issue);
}

/**
 * Every app transaction signs through here. Reading screens stay usable on a
 * mismatched wallet network, so this is the one place that refuses to sign
 * until the wallet matches the deployment network.
 */
export async function signWithWallet(
  ...args: Parameters<typeof StellarWalletsKit.signTransaction>
): ReturnType<typeof StellarWalletsKit.signTransaction> {
  assertWalletNetworkReady();
  return StellarWalletsKit.signTransaction(...args);
}
