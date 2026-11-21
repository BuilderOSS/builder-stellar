'use client';

import { useCallback, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { marketplaceErrorMessage } from '@/lib/marketplace/errors';
import { marketplaceFetch } from '@/lib/marketplace/hooks';
import {
  assertMarketplaceTransaction,
  assertMarketplaceWallet,
  assertUnchangedMarketplaceEnvelope,
  confirmMarketplaceTransaction
} from '@/lib/marketplace/transaction';
import type { MarketplaceAction, MarketplacePrepared } from '@/lib/marketplace/types';
import { withArchivedRestore } from '@/lib/restore-archived-client';
import { readSigningWallet, signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export const READY_MESSAGE = 'Check the details first. Nothing is signed until you press Sign and send.';

/**
 * One marketplace transaction at a time: prepare on the server, check, sign in the wallet,
 * submit and confirm. Shared by the single-action review and the guided sell sequence.
 */
export function useMarketplaceSigner(daoId: string) {
  const session = useAuthSessionStore();
  const { mutate } = useSWRConfig();
  const [prepared, setPrepared] = useState<MarketplacePrepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(READY_MESSAGE);
  const [hash, setHash] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const network = getDeploymentConfig();
  const allowed = session.authStatus === 'authenticated' && Boolean(session.address) && !session.walletNetworkIssue;

  const reset = useCallback((next = READY_MESSAGE) => {
    setPrepared(null);
    setHash('');
    setConfirmed(false);
    setMessage(next);
  }, []);

  /** Runs `work` alone (no double clicks), with the busy state shown. */
  async function exclusive<T>(work: () => Promise<T>): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  /** Prepares `action`; null when it is ready to sign, else the message shown. */
  async function prepare(action: MarketplaceAction): Promise<string | null> {
    if (!allowed) return 'Connect your wallet to trade.';
    return (
      (await exclusive(async () => {
        setPrepared(null);
        setHash('');
        setConfirmed(false);
        setMessage('Checking ownership, listing terms, balances and network fees…');
        try {
          const result = await withArchivedRestore(
            () =>
              marketplaceFetch<MarketplacePrepared>(`/api/dao/${encodeURIComponent(daoId)}/marketplace/prepare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action)
              }),
            {
              address: session.address ?? '',
              rpcUrl: network.rpcUrl,
              networkPassphrase: network.networkPassphrase,
              onRestoring: setMessage
            }
          );
          if (
            result.address !== session.address ||
            result.daoId !== daoId ||
            result.deploymentId !== DEPLOYMENT_ID ||
            result.networkPassphrase !== network.networkPassphrase
          )
            throw new Error('Transaction identity does not match this session.');
          setPrepared(result);
          setMessage('Checks passed. Review the exact terms and network fee below.');
          return null;
        } catch (error) {
          const text = marketplaceErrorMessage(error);
          setMessage(text);
          return text;
        }
      })) ?? 'Another check is already running.'
    );
  }

  /** Signs and submits the prepared transaction; the confirmed hash, or null. */
  async function sign(action: MarketplaceAction): Promise<string | null> {
    if (!prepared || !allowed) return null;
    return exclusive(async () => {
      setMessage('Checking the active wallet…');
      try {
        const [{ TransactionBuilder, rpc }] = await Promise.all([import('@stellar/stellar-sdk')]);
        const [wallet, walletNetwork] = await readSigningWallet();
        if (wallet.address !== useAuthSessionStore.getState().address) {
          throw new Error('The wallet account changed. Reconnect and authenticate before trading.');
        }
        assertMarketplaceWallet(
          wallet.address,
          walletNetwork.networkPassphrase,
          prepared.address,
          prepared.networkPassphrase,
          network.label
        );
        const unsigned = TransactionBuilder.fromXDR(prepared.xdr, prepared.networkPassphrase);
        try {
          assertMarketplaceTransaction(unsigned, prepared.address);
        } catch (error) {
          setPrepared(null);
          throw error;
        }
        setMessage('Waiting for your wallet signature…');
        const signed = await signWithWallet(prepared.xdr, {
          networkPassphrase: prepared.networkPassphrase,
          address: prepared.address
        });
        if (signed.signerAddress && signed.signerAddress !== prepared.address)
          throw new Error('Wallet signed with a different account.');
        const transaction = TransactionBuilder.fromXDR(signed.signedTxXdr, prepared.networkPassphrase);
        const txHash = assertUnchangedMarketplaceEnvelope(unsigned, transaction);
        setHash(txHash);
        setPrepared(null);
        setMessage('Submitting the signed transaction…');
        if (action.action === 'trustline') {
          const { Horizon } = await import('@stellar/stellar-sdk');
          const url =
            network.name === 'public'
              ? 'https://horizon.stellar.org'
              : network.name === 'testnet'
                ? 'https://horizon-testnet.stellar.org'
                : 'http://localhost:8000';
          await new Horizon.Server(url, { allowHttp: network.name === 'local' }).submitTransaction(transaction);
        } else {
          const server = new rpc.Server(prepared.rpcUrl, { allowHttp: network.name === 'local' });
          const submitted = await server.sendTransaction(transaction);
          if (submitted.status === 'ERROR')
            throw new Error('The network rejected this transaction. Refresh the listing and check again.');
          if (submitted.status === 'TRY_AGAIN_LATER')
            throw new Error(
              'The network is busy and has not accepted this transaction. Check its hash before preparing a retry.'
            );
          setMessage('Submitted. Waiting for on-chain confirmation…');
          await confirmMarketplaceTransaction(server, submitted.hash);
        }
        setConfirmed(true);
        setMessage(
          action.action === 'buy' && action.kind === 'pool'
            ? 'Confirmed. You now hold the token from the pool. The market can take a few seconds to update.'
            : 'Confirmed. The market can take a few seconds to update.'
        );
        await mutate((key) => Array.isArray(key) && key[0] === 'marketplace' && key[1] === DEPLOYMENT_ID).catch(() => {
          setMessage('Confirmed. The market’s data is unavailable right now, so refresh before your next trade.');
        });
        return txHash;
      } catch (error) {
        setMessage(marketplaceErrorMessage(error));
        return null;
      }
    });
  }

  return {
    session,
    network,
    allowed,
    prepared,
    busy,
    message,
    setMessage,
    hash,
    confirmed,
    prepare,
    sign,
    reset,
    /** Marks work outside prepare/sign (such as a permission read) as busy. */
    exclusive
  };
}
