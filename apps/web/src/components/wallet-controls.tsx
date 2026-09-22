'use client';

import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import { ChevronDown, LogOut, Wallet } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui';
import { getNetworkConfig, type NetworkName } from '@/config/networks';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type WalletNetwork = Pick<DaoNetworkConfig, 'label' | 'passphrase'>;

function shortenAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

async function validateWalletNetwork(
  address: string,
  currentNetwork: WalletNetwork,
  updateSession: ReturnType<typeof useDaoSessionStore.getState>['updateSession']
) {
  try {
    const walletNetwork = await StellarWalletsKit.getNetwork();
    const matchesConfiguredNetwork = walletNetwork.networkPassphrase === currentNetwork.passphrase;
    const status = matchesConfiguredNetwork
      ? `Connected on ${currentNetwork.label}`
      : `Wallet network mismatch: ${walletNetwork.network ?? 'unknown'} is not ${currentNetwork.label}`;

    updateSession({
      address,
      status,
      walletNetworkPassphrase: walletNetwork.networkPassphrase,
      walletNetworkIssue: matchesConfiguredNetwork
        ? ''
        : `Wallet is on ${walletNetwork.network ?? 'an unknown network'} and must be switched to ${currentNetwork.label}.`
    });
  } catch (error) {
    updateSession({
      address,
      status: 'Wallet network validation unavailable',
      walletNetworkPassphrase: '',
      walletNetworkIssue:
        error instanceof Error ? error.message : 'This wallet cannot report its network, so the app cannot validate it.'
    });
  }
}

export function WalletControls({ network }: { network?: WalletNetwork }) {
  const configuredNetwork = getNetworkConfig((process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName);
  const currentNetwork: WalletNetwork = network ?? {
    label: configuredNetwork.label,
    passphrase: configuredNetwork.networkPassphrase
  };
  const networkLabel = currentNetwork.label;
  const networkPassphrase = currentNetwork.passphrase;
  const session = useDaoSessionStore();
  const updateSession = useDaoSessionStore((state) => state.updateSession);

  useEffect(() => {
    StellarWalletsKit.init({ modules: defaultModules() });

    const onStateUpdated = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      updateSession({ address: event.payload.address ?? '' });
    });

    const onDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      updateSession({
        address: '',
        status: 'Disconnected',
        syncedAt: '',
        walletNetworkPassphrase: '',
        walletNetworkIssue: ''
      });
    });

    return () => {
      onStateUpdated();
      onDisconnect();
    };
  }, [updateSession]);

  useEffect(() => {
    if (!session.address) return;
    void validateWalletNetwork(session.address, { label: networkLabel, passphrase: networkPassphrase }, updateSession);
  }, [networkLabel, networkPassphrase, session.address, updateSession]);

  async function connectWallet() {
    try {
      const result = await StellarWalletsKit.authModal();
      await validateWalletNetwork(result.address, currentNetwork, updateSession);
    } catch (error) {
      updateSession({ status: error instanceof Error ? error.message : 'Wallet connection failed' });
    }
  }

  async function disconnectWallet() {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      updateSession({
        address: '',
        status: 'Disconnected',
        syncedAt: '',
        walletNetworkPassphrase: '',
        walletNetworkIssue: ''
      });
    }
  }

  return (
    <div className="wallet-summary">
      {session.address ? (
        <details className="wallet-menu">
          <summary
            className="wallet-menu__trigger"
            title={session.address}
            aria-label={`Wallet menu for ${session.address}`}
          >
            <Wallet aria-hidden="true" size={16} />
            {shortenAddress(session.address)}
            <ChevronDown aria-hidden="true" size={14} />
          </summary>
          <button className="wallet-menu__disconnect" type="button" onClick={disconnectWallet}>
            <LogOut aria-hidden="true" size={15} />
            Disconnect
          </button>
        </details>
      ) : (
        <Button type="button" variant="solid" size="sm" onClick={connectWallet} aria-label="Connect wallet">
          <Wallet aria-hidden="true" size={16} />
          Connect
        </Button>
      )}
    </div>
  );
}
