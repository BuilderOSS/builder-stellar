'use client';

import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { WalletConnectModule, WalletConnectTargetChain } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks } from '@creit.tech/stellar-wallets-kit/types';

import type { NetworkName } from '@/config/networks';

let initialized = false;

export function initializeWalletKit(network: NetworkName) {
  if (initialized) return;

  const modules = defaultModules();
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (projectId && network !== 'local') {
    modules.push(
      new WalletConnectModule({
        projectId,
        metadata: {
          name: 'Stellar DAOs',
          description: 'Explore and participate in Stellar DAO governance.',
          url: window.location.origin,
          icons: [`${window.location.origin}/icon.svg`]
        },
        allowedChains: [network === 'public' ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET]
      })
    );
  }

  StellarWalletsKit.init({
    modules,
    network: network === 'public' ? Networks.PUBLIC : network === 'local' ? Networks.STANDALONE : Networks.TESTNET,
    authModal: { showInstallLabel: true }
  });
  initialized = true;
}

export function isWalletConnectSelected() {
  try {
    return StellarWalletsKit.selectedModule.productId === 'wallet_connect';
  } catch {
    return false;
  }
}
