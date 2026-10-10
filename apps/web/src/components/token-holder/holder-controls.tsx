'use client';

import { useRef, useState } from 'react';
import { css } from 'styled-system/css';
import { useSWRConfig } from 'swr';

import { Address, Button, ChoiceGroup, Disclosure, Field, FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { card, muted, review as reviewBox, reviewTitle, title } from '@/components/ui/panel-styles';

const form = css({ display: 'grid', gap: '4' });
const buttons = css({ display: 'flex', justifyContent: 'flex-end', gap: '2' });
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { directoryFetch } from '@/lib/member-directory/hooks';
import { holderTokenId, memberAddress } from '@/lib/member-directory/validation';
import { currentTokenHolder } from '@/lib/token-holder/read';
import { assertHolderEnvelope, assertHolderSignedEnvelope, assertHolderWallet } from '@/lib/token-holder/transaction';
import type { HolderAction, HolderPrepared } from '@/lib/token-holder/types';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { signWithWallet } from '@/lib/wallet-sign';
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
      const signed = await signWithWallet(prepared.xdr, {
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
    <section className={card} aria-labelledby="holder-controls-title">
      <div>
        <h2 id="holder-controls-title" className={title}>
          Your token
        </h2>
        <p className={muted}>Only the holder can do these. Each one asks your wallet to sign.</p>
      </div>
      {!allowed ? (
        <p className={muted} role="status">
          {session.walletNetworkIssue ||
            (session.authStatus !== 'authenticated'
              ? 'Connect your wallet to manage a token you hold.'
              : session.walletNetworkPassphrase !== config.passphrase
                ? 'Switch your wallet to this community’s network.'
                : !liveOwner
                  ? 'Live ownership has to load before you can act.'
                  : 'Only the current holder can do this.')}
        </p>
      ) : null}
      <ChoiceGroup
        label="What do you want to do?"
        name="holder-action"
        value={kind}
        disabled={busy || Boolean(hash)}
        onValueChange={(value) => {
          setKind(value as typeof kind);
          clearReview();
        }}
        options={[
          { value: 'transfer', label: 'Send', description: 'Give this token to someone' },
          { value: 'delegate', label: 'Delegate votes', description: 'Let someone vote with your tokens' },
          { value: 'approve', label: 'Approve', description: 'Let an app move this token' },
          { value: 'revoke', label: 'Revoke', description: 'Remove that approval' }
        ]}
      />
      <div className={form}>
        {kind !== 'revoke' ? (
          <Field>
            <FieldLabel htmlFor="holder-destination">
              {kind === 'delegate' ? 'Delegate address' : kind === 'approve' ? 'Spender address' : 'Recipient address'}
            </FieldLabel>
            <Input
              id="holder-destination"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                clearReview();
              }}
              disabled={busy || Boolean(hash)}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="G… or C…"
            />
            {kind === 'delegate' ? (
              <FieldHelperText>
                Applies to every token you hold here, not just this one. You keep the tokens; only votes move.
              </FieldHelperText>
            ) : null}
          </Field>
        ) : (
          <p className={muted}>
            Removes this token’s single-token approval right away. The current spender isn’t shown because the contract
            doesn’t expose it. Collection-wide operator permissions don’t change.
          </p>
        )}
        {kind === 'approve' ? (
          <Field>
            <FieldLabel htmlFor="holder-expiry">Approval ends at ledger</FieldLabel>
            <Input
              id="holder-expiry"
              inputMode="numeric"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                clearReview();
              }}
              disabled={busy || Boolean(hash)}
            />
            <FieldHelperText>
              A ledger number, not a date. The spender can move your token until then or until you revoke it.
            </FieldHelperText>
            <div>
              <Button variant="ghost" size="sm" disabled={!allowed || busy || Boolean(hash)} onClick={useShortApproval}>
                Use a short approval (about 10 minutes)
              </Button>
            </div>
          </Field>
        ) : null}
        {kind === 'delegate' ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!allowed || busy || Boolean(hash)}
              onClick={() => {
                setDestination(session.address);
                clearReview();
              }}
            >
              Vote for myself again
            </Button>
          </div>
        ) : null}
        {!hash && !review ? (
          <Button block variant="secondary" disabled={!allowed} loading={busy} onClick={prepare}>
            {busy ? 'Checking' : 'Review'}
          </Button>
        ) : null}
      </div>
      {review ? (
        <div className={reviewBox} aria-label="Transaction review">
          <p className={reviewTitle}>{review.prepared.summary}</p>
          <p className={muted}>
            Network fee: {review.prepared.fee} stroops (10,000,000 stroops = 1 XLM). Nothing is signed until you press
            Sign.
          </p>
          <Disclosure title="Technical details">
            <Address value={review.prepared.address} label="Signer" />
            <Address value={review.prepared.tokenContractId} label="Token contract" />
          </Disclosure>
          <div className={buttons}>
            <Button variant="ghost" disabled={busy} onClick={clearReview}>
              Cancel
            </Button>
            <Button disabled={!allowed} loading={busy} onClick={sign}>
              Sign and send
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className={muted} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {hash ? (
        <div className={reviewBox}>
          <Address value={hash} label="Transaction" />
          {confirmed ? (
            <Button
              variant="secondary"
              onClick={() => {
                setHash('');
                setConfirmed(false);
                clearReview();
              }}
            >
              Do something else
            </Button>
          ) : (
            <p className={muted}>
              Don’t send it again while it’s confirming. Check the transaction, or refresh after it lands.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
