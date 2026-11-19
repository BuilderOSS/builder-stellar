'use client';

import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { WalletConnectModule, WalletConnectTargetChain } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { type ModuleInterface, Networks } from '@creit.tech/stellar-wallets-kit/types';

import type { NetworkName } from '@/config/networks';
import { SITE_NAME } from '@/lib/site';

let initialized = false;

/** WalletConnect (phone wallets) is offered only with a project id, and never on a local network. */
export function walletConnectEnabled(network: NetworkName) {
  return Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()) && network !== 'local';
}

export function initializeWalletKit(network: NetworkName) {
  if (initialized) return;

  const modules = defaultModules();
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (projectId && network !== 'local') {
    modules.push(
      new WalletConnectModule({
        projectId,
        metadata: {
          name: SITE_NAME,
          description: 'Build a tribe: a DAO on Stellar with a shared treasury and onchain votes.',
          url: window.location.origin,
          icons: [`${window.location.origin}/icon.svg`]
        },
        allowedChains: [network === 'public' ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET]
      })
    );
  }

  // Walkthrough builds only (apps/e2e). The flag is inlined at build time, so in every other build
  // this branch is the constant `false` and the bundler never resolves the module.
  // scripts/assert-e2e-wallet.mjs fails the build if it shows up anyway.
  if (process.env.NEXT_PUBLIC_E2E_WALLET === '1') {
    const { E2EWalletModule } = require('./e2e-wallet/module') as { E2EWalletModule: new () => ModuleInterface };
    modules.unshift(new E2EWalletModule());
  }

  StellarWalletsKit.init({
    modules,
    network: network === 'public' ? Networks.PUBLIC : network === 'local' ? Networks.STANDALONE : Networks.TESTNET,
    authModal: { showInstallLabel: true }
  });
  initialized = true;
}

// Lives with the signing helpers so they can use it without loading every wallet module.
export { isWalletConnectSelected } from './wallet-sign';
