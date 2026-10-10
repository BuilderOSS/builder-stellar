'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getNetworkConfig, type NetworkName } from '@/config/networks';
import { activeNetworkName } from '@/lib/active-network';
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
import { toaster } from '@/lib/toaster';
import { useWalletBalance } from '@/lib/wallet-balance';
import { initializeWalletKit, isWalletConnectSelected } from '@/lib/wallet-kit';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export type WalletNetwork = {
  name: NetworkName;
  label: string;
  passphrase: string;
};

type WalletSession = {
  network: WalletNetwork;
  address: string;
  isAuthenticated: boolean;
  isAuthBusy: boolean;
  authStatus: ReturnType<typeof useAuthSessionStore.getState>['authStatus'];
  networkIssue: string;
  balance: string | null | undefined;
  balanceLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletSessionContext = createContext<WalletSession | null>(null);

function deploymentNetwork(): WalletNetwork {
  const config = getNetworkConfig(activeNetworkName());
  return { name: config.name, label: config.label, passphrase: config.networkPassphrase };
}

async function validateWalletNetwork(
  currentNetwork: WalletNetwork,
  updateSession: ReturnType<typeof useAuthSessionStore.getState>['updateSession']
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
        : `Your wallet is on ${walletNetwork.network ?? 'another network'}. Switch it to ${currentNetwork.label}.`
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
        error instanceof Error ? error.message : "This wallet can't report its network, so Builder can't check it."
    });
  }
}

/**
 * One wallet session for the whole app: Stellar Wallets Kit listeners, the
 * SEP-53 sign-in with SEP-10 fallback, account-change logout and network
 * validation. Mount once (root layout); read it with `useWalletSession`.
 */
export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const network = useMemo(() => deploymentNetwork(), []);
  const session = useAuthSessionStore();
  const updateSession = useAuthSessionStore((state) => state.updateSession);
  const setAuthStatus = useAuthSessionStore((state) => state.setAuthStatus);
  const setAuthenticatedAddress = useAuthSessionStore((state) => state.setAuthenticatedAddress);
  const resetAuth = useAuthSessionStore((state) => state.resetAuth);
  const { data: authSession, mutate: mutateAuthSession } = useAuthSession();
  const [walletAddress, setWalletAddress] = useState<string | null | undefined>(undefined);
  const lastErrorRef = useRef('');

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
    network.name
  );

  useEffect(() => {
    initializeWalletKit(network.name);

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
  }, [invalidateAuth, network.name, resetAuth, session.address, session.authStatus]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void validateWalletNetwork(network, updateSession);
  }, [isAuthenticated, network, updateSession]);

  useEffect(() => {
    if (!authSession?.authenticated || !authSession.address) return;
    if (walletAddress === undefined) return;
    if ((session.address && session.address !== authSession.address) || walletAddress !== authSession.address) {
      void invalidateAuth();
      return;
    }
    setAuthenticatedAddress(authSession.address);
  }, [authSession, invalidateAuth, session.address, setAuthenticatedAddress, walletAddress]);

  // Sign-in failures used to be silent; surface them once.
  useEffect(() => {
    if (session.authStatus !== 'error' || !session.authError || lastErrorRef.current === session.authError) return;
    lastErrorRef.current = session.authError;
    toaster.error({ title: "Couldn't connect your wallet", description: session.authError, duration: 8000 });
  }, [session.authError, session.authStatus]);

  const connect = useCallback(async () => {
    lastErrorRef.current = '';
    try {
      setAuthStatus('connecting-wallet');
      const result = await StellarWalletsKit.authModal();
      setWalletAddress(result.address);
      if (!isWalletConnectSelected()) {
        const walletNetwork = await StellarWalletsKit.getNetwork();
        if (walletNetwork.networkPassphrase !== network.passphrase) {
          throw new Error(`Switch your wallet to ${network.label} and try again.`);
        }
      }

      setAuthStatus('requesting-challenge');
      const challenge = await requestAuthChallenge(result.address);
      const message = createClientAuthMessage(challenge, result.address);

      let authMethod: 'sep53' | 'sep10' = 'sep53';
      try {
        setAuthStatus('awaiting-signature');
        const { signedMessage, signerAddress } = await StellarWalletsKit.signMessage(message, {
          networkPassphrase: network.passphrase,
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
          networkPassphrase: network.passphrase,
          address: result.address
        });
        if (signerAddress && signerAddress !== result.address) {
          throw new Error('The wallet signed with a different address.');
        }

        setAuthStatus('verifying-signature');
        await verifySep10Proof(signedTxXdr);
      }

      setAuthenticatedAddress(result.address);
      updateSession({ status: `Connected on ${network.label} via ${authMethod.toUpperCase()}` });
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
      setAuthStatus('error', error instanceof Error ? error.message : 'Wallet sign-in failed.');
    }
  }, [mutateAuthSession, network, resetAuth, setAuthStatus, setAuthenticatedAddress, updateSession]);

  const disconnect = useCallback(async () => {
    try {
      await logoutAuth();
      await StellarWalletsKit.disconnect();
    } finally {
      resetAuth();
      await mutateAuthSession({ authenticated: false, address: null }, false);
    }
  }, [mutateAuthSession, resetAuth]);

  const value = useMemo<WalletSession>(
    () => ({
      network,
      address: session.address,
      isAuthenticated,
      isAuthBusy,
      authStatus: session.authStatus,
      networkIssue: session.walletNetworkIssue,
      balance: isAuthenticated ? balance : null,
      balanceLoading,
      connect,
      disconnect
    }),
    [
      balance,
      balanceLoading,
      connect,
      disconnect,
      isAuthBusy,
      isAuthenticated,
      network,
      session.address,
      session.authStatus,
      session.walletNetworkIssue
    ]
  );

  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

export function useWalletSession(): WalletSession {
  const context = useContext(WalletSessionContext);
  if (!context) throw new Error('useWalletSession must be used within WalletSessionProvider');
  return context;
}

export function formatXlmBalance(value: string | null | undefined) {
  if (value === null || typeof value === 'undefined') return 'Unavailable';
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`;
}
