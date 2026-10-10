'use client';

import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { formatMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceErrorMessage } from '@/lib/marketplace/errors';
import { marketplaceFetch } from '@/lib/marketplace/hooks';
import {
  assertMarketplaceTransaction,
  assertMarketplaceWallet,
  assertUnchangedMarketplaceEnvelope,
  confirmMarketplaceTransaction
} from '@/lib/marketplace/transaction';
import type { MarketplaceAction, MarketplacePrepared } from '@/lib/marketplace/types';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace.module.css';

export function TradeReview({
  daoId,
  action,
  onClose,
  onConfirmed
}: {
  daoId: string;
  action: MarketplaceAction;
  onClose: () => void;
  onConfirmed?: () => void;
}) {
  const session = useAuthSessionStore();
  const { mutate } = useSWRConfig();
  const dialog = useRef<HTMLDialogElement>(null);
  const [prepared, setPrepared] = useState<MarketplacePrepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    'Review the action, then check balances and simulate. No signature is requested until you choose Sign and submit.'
  );
  const [hash, setHash] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const network = getDeploymentConfig();
  const allowed = session.authStatus === 'authenticated' && Boolean(session.address) && !session.walletNetworkIssue;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function prepare() {
    if (inFlight.current || !allowed) return;
    inFlight.current = true;
    setBusy(true);
    setPrepared(null);
    setHash('');
    setMessage('Checking ownership, listing terms, balances and network fees…');
    try {
      const result = await marketplaceFetch<MarketplacePrepared>(
        `/api/dao/${encodeURIComponent(daoId)}/marketplace/prepare`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action)
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
      setMessage('Simulation passed. Review the exact terms and network fee below.');
    } catch (error) {
      setMessage(marketplaceErrorMessage(error));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function sign() {
    if (!prepared || inFlight.current || !allowed) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('Checking the active wallet…');
    try {
      const [{ StellarWalletsKit }, { TransactionBuilder, rpc, scValToNative }] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@stellar/stellar-sdk')
      ]);
      const [wallet, walletNetwork] = await Promise.all([
        StellarWalletsKit.getAddress(),
        StellarWalletsKit.getNetwork()
      ]);
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
      let mintedToken: number | null = null;
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
          throw new Error('The network rejected this transaction. Refresh the listing and simulate again.');
        if (submitted.status === 'TRY_AGAIN_LATER')
          throw new Error(
            'The network is busy and has not accepted this transaction. Check its hash before preparing a retry.'
          );
        setMessage('Submitted. Waiting for on-chain confirmation…');
        const confirmation = await confirmMarketplaceTransaction(server, submitted.hash);
        if (
          action.action === 'buy' &&
          action.kind === 'primary' &&
          'returnValue' in confirmation &&
          confirmation.returnValue
        ) {
          try {
            const tokenId: unknown = scValToNative(confirmation.returnValue);
            if (typeof tokenId === 'number' && Number.isInteger(tokenId) && tokenId >= 0 && tokenId <= 0xffffffff)
              mintedToken = tokenId;
          } catch {
            /* An unavailable optional receipt must never turn confirmed success into a failure. */
          }
        }
      }
      setConfirmed(true);
      setMessage(
        mintedToken === null
          ? 'Confirmed on-chain. The indexed marketplace may take a few seconds to update.'
          : `Confirmed on-chain. NFT token #${mintedToken} was minted to your account. The indexed marketplace may take a few seconds to update.`
      );
      await mutate((key) => Array.isArray(key) && key[0] === 'marketplace' && key[1] === DEPLOYMENT_ID).catch(() => {
        setMessage('Confirmed on-chain. Indexed reads are currently unavailable; refresh before making another trade.');
      });
      onConfirmed?.();
    } catch (error) {
      setMessage(marketplaceErrorMessage(error));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="trade-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className={styles.stack}>
        <div className={styles.row}>
          <h2 id="trade-title">Review marketplace action</h2>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close transaction review">
            Close
          </button>
        </div>
        <p className={styles.eyebrow}>
          {action.action} · {network.label}
        </p>
        {'id' in action ? (
          <p>
            {action.kind === 'primary' ? 'Primary listing' : 'Secondary token'} #{action.id}
          </p>
        ) : null}
        {'tokenId' in action ? <p>Token #{action.tokenId}</p> : null}
        {!allowed ? (
          <p role="alert">
            {session.walletNetworkIssue ||
              'Connect and authenticate your wallet using the wallet control before trading.'}
          </p>
        ) : null}
        <p role="status" aria-live="polite">
          {message}
        </p>
        {prepared ? (
          <div className={styles.notice}>
            <p>{prepared.summary}</p>
            <p>
              Network fee: <strong>{formatMarketplaceAmount(prepared.fee)} XLM</strong>
            </p>
            <p className={styles.address}>Signer: {prepared.address}</p>
          </div>
        ) : null}
        {hash ? (
          <div className={styles.notice}>
            <p className={styles.address}>Transaction: {hash}</p>
            {network.name !== 'local' ? (
              <a href={getExplorerTxUrl(network.name, hash)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            ) : null}
          </div>
        ) : null}
        {!confirmed && !hash ? (
          <button
            type="button"
            className={styles.primary}
            disabled={!allowed || busy}
            onClick={prepared ? sign : prepare}
          >
            {busy ? 'Please wait…' : prepared ? 'Sign and submit' : 'Check balances and simulate'}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </dialog>
  );
}
