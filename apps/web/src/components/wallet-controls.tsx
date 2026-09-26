'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import { Check, ChevronDown, Copy, ExternalLink, LogOut, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button, Skeleton } from '@/components/ui';
import { getNetworkConfig, type NetworkName } from '@/config/networks';
import {
  createClientAuthMessage,
  isSep53UnsupportedError,
  logoutAuth,
  normalizeWalletSignature,
  requestAuthChallenge,
  requestSep10Challenge,
  useAuthSession,
  verifyAuthProof,
  verifySep10Proof
} from '@/lib/auth/client';
import { getExplorerAccountUrl } from '@/lib/explorer-links';
import { useWalletBalance } from '@/lib/wallet-balance';
import { initializeWalletKit, isWalletConnectSelected } from '@/lib/wallet-kit';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type WalletNetwork = {
  name: NetworkName;
  label: string;
  passphrase: string;
};

function shortenAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

async function validateWalletNetwork(
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
      status,
      walletNetworkPassphrase: walletNetwork.networkPassphrase,
      walletNetworkIssue: matchesConfiguredNetwork
        ? ''
        : `Wallet is on ${walletNetwork.network ?? 'an unknown network'} and must be switched to ${currentNetwork.label}.`
    });
  } catch (error) {
    if (isWalletConnectSelected()) {
      updateSession({
        status: `Connected on ${currentNetwork.label} (verify mobile wallet network)`,
        walletNetworkPassphrase: currentNetwork.passphrase,
        walletNetworkIssue: ''
      });
      return;
    }

    updateSession({
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
    name: configuredNetwork.name,
    label: configuredNetwork.label,
    passphrase: configuredNetwork.networkPassphrase
  };
  const networkName = currentNetwork.name;
  const networkLabel = currentNetwork.label;
  const networkPassphrase = currentNetwork.passphrase;
  const session = useDaoSessionStore();
  const updateSession = useDaoSessionStore((state) => state.updateSession);
  const setAuthStatus = useDaoSessionStore((state) => state.setAuthStatus);
  const setAuthenticatedAddress = useDaoSessionStore((state) => state.setAuthenticatedAddress);
  const resetAuth = useDaoSessionStore((state) => state.resetAuth);
  const { data: authSession, mutate: mutateAuthSession } = useAuthSession();
  const [copied, setCopied] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null | undefined>(undefined);
  const invalidateAuth = useCallback(async () => {
    try {
      await logoutAuth();
    } finally {
      resetAuth();
      await mutateAuthSession({ authenticated: false, address: null }, false);
    }
  }, [mutateAuthSession, resetAuth]);
  const isAuthenticated = session.authStatus === 'authenticated' && Boolean(session.address);
  const isAuthBusy =
    session.authStatus === 'connecting-wallet' ||
    session.authStatus === 'requesting-challenge' ||
    session.authStatus === 'awaiting-signature' ||
    session.authStatus === 'verifying-signature';
  const { data: balance, isLoading: balanceLoading } = useWalletBalance(
    isAuthenticated ? session.address : '',
    networkName
  );

  useEffect(() => {
    initializeWalletKit(networkName);

    const handleWalletAddress = (address: string) => {
      setWalletAddress(address);
      if (session.authStatus === 'authenticated' && session.address && session.address !== address) {
        void invalidateAuth();
      }
    };

    const onStateUpdated = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      const address = event.payload.address;
      if (!address) return;
      handleWalletAddress(address);
    });

    const onDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      setWalletAddress(null);
      if (session.authStatus === 'authenticated') void invalidateAuth();
      else resetAuth();
    });

    void StellarWalletsKit.getAddress()
      .then(({ address }) => handleWalletAddress(address))
      .catch(() => setWalletAddress(null));

    return () => {
      onStateUpdated();
      onDisconnect();
    };
  }, [invalidateAuth, networkName, resetAuth, session.address, session.authStatus]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void validateWalletNetwork(
      { name: networkName, label: networkLabel, passphrase: networkPassphrase },
      updateSession
    );
  }, [isAuthenticated, networkLabel, networkName, networkPassphrase, updateSession]);

  useEffect(() => {
    if (!authSession?.authenticated || !authSession.address) return;
    if (walletAddress === undefined) return;
    if ((session.address && session.address !== authSession.address) || walletAddress !== authSession.address) {
      void invalidateAuth();
      return;
    }
    setAuthenticatedAddress(authSession.address);
  }, [authSession, invalidateAuth, session.address, setAuthenticatedAddress, walletAddress]);

  async function connectWallet() {
    try {
      setAuthStatus('connecting-wallet');
      const result = await StellarWalletsKit.authModal();
      setWalletAddress(result.address);
      if (!isWalletConnectSelected()) {
        const walletNetwork = await StellarWalletsKit.getNetwork();
        if (walletNetwork.networkPassphrase !== currentNetwork.passphrase) {
          throw new Error(`Switch your wallet to ${currentNetwork.label} and try again.`);
        }
      }

      setAuthStatus('requesting-challenge');
      const challenge = await requestAuthChallenge(result.address);
      const message = createClientAuthMessage(challenge, result.address);

      let authMethod: 'sep53' | 'sep10' = 'sep53';
      try {
        setAuthStatus('awaiting-signature');
        const { signedMessage, signerAddress } = await StellarWalletsKit.signMessage(message, {
          networkPassphrase: currentNetwork.passphrase,
          address: result.address
        });
        if (signerAddress && signerAddress !== result.address) {
          throw new Error('The wallet signed with a different address.');
        }

        setAuthStatus('verifying-signature');
        await verifyAuthProof({
          address: result.address,
          message,
          signature: normalizeWalletSignature(signedMessage)
        });
      } catch (error) {
        console.warn('[Auth] SEP-53 failed, attempting SEP-10 fallback', {
          error: error instanceof Error ? error.message : String(error)
        });
        if (!isSep53UnsupportedError(error)) throw error;

        authMethod = 'sep10';
        setAuthStatus('requesting-challenge');
        const sep10Challenge = await requestSep10Challenge(result.address);
        setAuthStatus('awaiting-signature');
        const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(sep10Challenge.xdr, {
          networkPassphrase: currentNetwork.passphrase,
          address: result.address
        });
        if (signerAddress && signerAddress !== result.address) {
          throw new Error('The wallet signed with a different address.');
        }

        setAuthStatus('verifying-signature');
        await verifySep10Proof(signedTxXdr);
      }

      setAuthenticatedAddress(result.address);
      updateSession({ status: `Connected on ${currentNetwork.label} via ${authMethod.toUpperCase()}` });
      await mutateAuthSession();
    } catch (error) {
      resetAuth();
      try {
        await StellarWalletsKit.disconnect();
      } catch {
        // The wallet may already be disconnected after a rejected prompt.
      }
      setWalletAddress(null);
      await mutateAuthSession({ authenticated: false, address: null }, false);
      setAuthStatus('error', error instanceof Error ? error.message : 'Wallet authentication failed.');
    }
  }

  async function disconnectWallet() {
    try {
      await logoutAuth();
      await StellarWalletsKit.disconnect();
    } finally {
      resetAuth();
      await mutateAuthSession({ authenticated: false, address: null }, false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(session.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  function formatBalance(value: string | null | undefined) {
    if (value === null || typeof value === 'undefined') return 'Unavailable';
    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`;
  }

  return (
    <div className="wallet-summary">
      {isAuthenticated ? (
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
          <div className="wallet-menu__panel">
            <div className="wallet-menu__balance">
              <span>Balance</span>
              <strong>
                {balanceLoading ? (
                  <Skeleton className="skeleton--inline" style={{ width: '80px', height: '1em' }} />
                ) : (
                  formatBalance(isAuthenticated ? balance : null)
                )}
              </strong>
            </div>
            <a
              className="wallet-menu__action"
              href={getExplorerAccountUrl(currentNetwork.name, session.address)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden="true" size={15} />
              View on Stellar Expert
            </a>
            <button className="wallet-menu__action" type="button" onClick={copyAddress}>
              {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
              {copied ? 'Copied' : 'Copy address'}
            </button>
            <button className="wallet-menu__action" type="button" onClick={disconnectWallet}>
              <LogOut aria-hidden="true" size={15} />
              Disconnect
            </button>
          </div>
        </details>
      ) : (
        <Button
          type="button"
          variant="solid"
          size="sm"
          onClick={connectWallet}
          disabled={isAuthBusy}
          aria-label="Connect wallet"
          aria-busy={isAuthBusy || undefined}
        >
          <Wallet aria-hidden="true" size={16} />
          {isAuthBusy ? 'Signing in…' : session.authStatus === 'error' ? 'Try again' : 'Connect'}
        </Button>
      )}
    </div>
  );
}
