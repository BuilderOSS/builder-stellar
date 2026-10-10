'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';

import { useAuthSessionStore } from '@/stores/auth-session-store';

export class WalletNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletNetworkError';
  }
}

/** Whether the connected wallet came through WalletConnect (mobile wallets, Freighter's in-app browser). */
export function isWalletConnectSelected() {
  try {
    return StellarWalletsKit.selectedModule.productId === 'wallet_connect';
  } catch {
    return false;
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

/**
 * The account and network the wallet will sign with, for the "is this still the reviewed wallet?"
 * checks before a transaction. WalletConnect wallets (including Freighter's mobile in-app browser)
 * can't report their network: the kit's `getNetwork` always throws for them. Their session is opened
 * for this app's network, so use the network the session recorded at connect time instead.
 */
export async function readSigningWallet(): Promise<[{ address: string }, { networkPassphrase: string }]> {
  const { address } = await StellarWalletsKit.getAddress();
  if (isWalletConnectSelected()) {
    return [{ address }, { networkPassphrase: useAuthSessionStore.getState().walletNetworkPassphrase }];
  }
  const { networkPassphrase } = await StellarWalletsKit.getNetwork();
  return [{ address }, { networkPassphrase }];
}
