'use client';

import { useRef, useState } from 'react';
import { useSWRConfig } from 'swr';

import styles from '@/components/member-directory/directory.module.css';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { directoryFetch } from '@/lib/member-directory/hooks';
import { holderTokenId, memberAddress } from '@/lib/member-directory/validation';
import { currentTokenHolder } from '@/lib/token-holder/read';
import { assertHolderEnvelope, assertHolderSignedEnvelope, assertHolderWallet } from '@/lib/token-holder/transaction';
import type { HolderAction, HolderPrepared } from '@/lib/token-holder/types';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export function HolderControls({
  tokenId,
  owner,
  liveOwner,
  onRefresh
}: {
  tokenId: number;
  owner: string | null;
  liveOwner: boolean;
  onRefresh: () => void;
}) {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const { mutate } = useSWRConfig();
  const [kind, setKind] = useState<HolderAction['action']>('transfer');
  const [destination, setDestination] = useState('');
  const [expiry, setExpiry] = useState('');
  const [review, setReview] = useState<{ action: HolderAction; prepared: HolderPrepared } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [hash, setHash] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const allowed =
    session.authStatus === 'authenticated' &&
    session.address === owner &&
    liveOwner &&
    !session.walletNetworkIssue &&
    session.walletNetworkPassphrase === config.passphrase;
  function clearReview() {
    setReview(null);
    setMessage('');
  }
  async function useShortApproval() {
    if (!allowed || inFlight.current || hash) return;
    inFlight.current = true;
    setBusy(true);
    clearReview();
    try {
      const { rpc } = await import('@stellar/stellar-sdk');
      const latest = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).getLatestLedger();
      setExpiry(String(holderTokenId(String(latest.sequence + 120))));
      setMessage('Expiry set to 120 ledgers after the current ledger. Review and simulate before signing.');
    } catch {
      setMessage('The current ledger is unavailable. Try again or enter a known future expiry ledger.');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function prepare() {
    if (!allowed || inFlight.current || hash) return;
    inFlight.current = true;
    setBusy(true);
    setReview(null);
    setMessage('Checking live ownership and simulating…');
    try {
      const action: HolderAction =
        kind === 'revoke'
          ? { action: kind, tokenId: String(tokenId) }
          : kind === 'approve'
            ? {
                action: kind,
                tokenId: String(tokenId),
                destination: memberAddress(destination),
                expirationLedger: String(holderTokenId(expiry))
              }
            : { action: kind, tokenId: String(tokenId), destination: memberAddress(destination) };
      const prepared = await directoryFetch<HolderPrepared>(`/api/dao/${encodeURIComponent(daoId)}/tokens/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      if (
        prepared.deploymentId !== DEPLOYMENT_ID ||
        prepared.daoId !== config.tokenContractId ||
        prepared.tokenContractId !== config.tokenContractId ||
        prepared.tokenId !== tokenId ||
        prepared.address !== useAuthSessionStore.getState().address ||
        prepared.networkPassphrase !== config.passphrase ||
        prepared.rpcUrl !== config.rpcUrl
      )
        throw new Error('Transaction identity does not match this session and DAO.');
      const { TransactionBuilder } = await import('@stellar/stellar-sdk');
      assertHolderEnvelope(TransactionBuilder.fromXDR(prepared.xdr, config.passphrase), prepared, action);
      setReview({ action, prepared });
      setMessage('Simulation passed. Review the details below. Nothing has been signed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to prepare this action.');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function sign() {
    if (!allowed || !review || inFlight.current || hash) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('Checking your wallet and current ownership…');
    const { prepared, action } = review;
    try {
      const [{ StellarWalletsKit }, { Client }, { TransactionBuilder, rpc }] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@builder-stellar/token-bindings'),
        import('@stellar/stellar-sdk')
      ]);
      const [wallet, network] = await Promise.all([StellarWalletsKit.getAddress(), StellarWalletsKit.getNetwork()]);
      const current = useAuthSessionStore.getState();
      if (current.authStatus !== 'authenticated' || current.address !== prepared.address)
        throw new Error('Authenticate again before signing.');
      assertHolderWallet(wallet.address, network.networkPassphrase, prepared.address, prepared.networkPassphrase);
      const token = new Client({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: prepared.address,
        allowHttp: config.name === 'local'
      });
      const latestOwner = await currentTokenHolder(token, tokenId);
      if (latestOwner !== prepared.address) {
        onRefresh();
        throw new Error('Ownership changed. Refresh this token before continuing.');
      }
      if (action.action === 'approve') {
        const latest = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).getLatestLedger();
        if (Number(action.expirationLedger) <= latest.sequence)
          throw new Error('The approval expiry has passed. Choose a future ledger and simulate again.');
      }
      const unsigned = TransactionBuilder.fromXDR(prepared.xdr, config.passphrase);
      assertHolderEnvelope(unsigned, prepared, action);
      // Re-check store after asynchronous reads. Only this explicit click can prompt the wallet.
      if (
        useAuthSessionStore.getState().address !== prepared.address ||
        useAuthSessionStore.getState().authStatus !== 'authenticated'
      )
        throw new Error('Your account changed. Authenticate again.');
      setMessage('Waiting for your wallet signature…');
      const signed = await StellarWalletsKit.signTransaction(prepared.xdr, {
        address: prepared.address,
        networkPassphrase: config.passphrase
      });
      if (signed.signerAddress && signed.signerAddress !== prepared.address)
        throw new Error('The wallet signed with another account. Nothing was submitted.');
      const transaction = TransactionBuilder.fromXDR(signed.signedTxXdr, config.passphrase);
      const txHash = assertHolderSignedEnvelope(unsigned, transaction);
      setHash(txHash);
      setReview(null);
      setMessage('Submitting. Check this transaction hash before any retry.');
      const submitted = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).sendTransaction(
        transaction
      );
      if (submitted.status === 'ERROR' || submitted.status === 'TRY_AGAIN_LATER')
        throw new Error('The network did not accept this transaction. Check its hash before retrying.');
      setMessage('Submitted. Waiting for confirmation…');
      await waitForConfirmation(submitted.hash, config.rpcUrl);
      setConfirmed(true);
      setMessage('Confirmed on-chain. Indexed ownership and votes may take a moment to update.');
      onRefresh();
      await mutate(
        (key) =>
          Array.isArray(key) &&
          ['member-directory', 'token-holder'].includes(key[0]) &&
          key[1] === DEPLOYMENT_ID &&
          key[2] === daoId
      ).catch(() => {});
    } catch (error) {
      setReview(null);
      setMessage(error instanceof Error ? error.message : 'This action could not complete.');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <section className={styles.panel} aria-labelledby="holder-controls-title">
      <h2 id="holder-controls-title">Holder controls</h2>
      <p className={styles.muted}>
        These actions belong to the token holder, not the DAO administrator. Each needs your review and a wallet
        signature.
      </p>
      {!allowed ? (
        <p>
          {session.walletNetworkIssue ||
            (session.authStatus !== 'authenticated'
              ? 'Connect and authenticate your wallet using the wallet control.'
              : session.walletNetworkPassphrase !== config.passphrase
                ? 'Switch your wallet to this DAO’s network.'
                : !liveOwner
                  ? 'Live ownership must be available before using these controls.'
                  : 'Only the current holder can use these controls.')}
        </p>
      ) : null}
      <div className={styles.row}>
        {(['transfer', 'approve', 'revoke', 'delegate'] as const).map((action) => (
          <button
            type="button"
            key={action}
            aria-pressed={kind === action}
            disabled={busy || Boolean(hash)}
            onClick={() => {
              setKind(action);
              clearReview();
            }}
          >
            {action === 'transfer'
              ? 'Transfer'
              : action === 'approve'
                ? 'Approve a spender'
                : action === 'revoke'
                  ? 'Revoke approval'
                  : 'Delegate votes'}
          </button>
        ))}
      </div>
      <div className={styles.form}>
        {kind !== 'revoke' ? (
          <label>
            {kind === 'delegate'
              ? 'Delegate address (all your owned tokens)'
              : kind === 'approve'
                ? 'Spender address'
                : 'Recipient address'}
            <input
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                clearReview();
              }}
              disabled={busy || Boolean(hash)}
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
        ) : (
          <p>
            Revoke this token’s single-token approval immediately. No approval getter is available in the current
            binding, so the current spender is not displayed. Collection-wide operator permissions are not changed.
          </p>
        )}
        {kind === 'approve' ? (
          <div className={styles.form}>
            <label>
              Expiry ledger (not a date or duration)
              <input
                inputMode="numeric"
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  clearReview();
                }}
                disabled={busy || Boolean(hash)}
              />
              <span className={styles.muted}>
                Choose a future ledger within the network’s temporary-storage lifetime. Simulation checks the limit. A
                spender can transfer your token until this approval expires or you revoke it.
              </span>
            </label>
            <button type="button" disabled={!allowed || busy || Boolean(hash)} onClick={useShortApproval}>
              Use a short approval (120 ledgers)
            </button>
          </div>
        ) : null}
        {kind === 'delegate' ? (
          <>
            <p>
              Delegation applies to all tokens you own in this DAO, not just this token. It changes who can vote with
              their voting units, not who owns them.
            </p>
            <button
              type="button"
              disabled={!allowed || busy || Boolean(hash)}
              onClick={() => {
                setDestination(session.address);
                clearReview();
              }}
            >
              Use my address to reclaim my votes
            </button>
          </>
        ) : null}
        {!hash ? (
          <button type="button" disabled={!allowed || busy} onClick={prepare}>
            {busy ? 'Please wait…' : 'Review and simulate'}
          </button>
        ) : null}
      </div>
      {review ? (
        <div className={styles.notice} aria-label="Transaction review">
          <p>{review.prepared.summary}</p>
          <p>
            Network: {config.label || config.name} · Fee: {review.prepared.fee} stroops (10,000,000 stroops = 1 XLM)
          </p>
          <p className={styles.address}>Signer: {review.prepared.address}</p>
          <p className={styles.address}>Token contract: {review.prepared.tokenContractId}</p>
          <p>No signature or submission happens until you choose the button below.</p>
          <div className={styles.row}>
            <button type="button" disabled={!allowed || busy} onClick={sign}>
              Sign and submit
            </button>
            <button type="button" disabled={busy} onClick={clearReview}>
              Cancel review
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {hash ? (
        <div className={styles.notice}>
          <p className={styles.address}>Transaction: {hash}</p>
          {config.name !== 'local' ? (
            <a href={getExplorerTxUrl(config.name, hash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          ) : null}
          {confirmed ? (
            <button
              type="button"
              onClick={() => {
                setHash('');
                setConfirmed(false);
                clearReview();
              }}
            >
              Start another action
            </button>
          ) : (
            <p>
              Do not resubmit while confirmation is uncertain. Check the transaction hash or refresh this page after
              checking the chain.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
