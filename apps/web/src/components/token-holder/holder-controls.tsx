'use client';

import { useRef, useState } from 'react';
import { css } from 'styled-system/css';
import { useSWRConfig } from 'swr';

import {
  Address,
  Button,
  ButtonLink,
  ChoiceGroup,
  Disclosure,
  Field,
  FieldHelperText,
  FieldLabel,
  Input
} from '@/components/ui';
import { card, muted, review as reviewBox, reviewTitle, title } from '@/components/ui/panel-styles';

const form = css({ display: 'grid', gap: '4' });
/** About 120 days of ledgers: a proposal's longest timeline is 104 days, under the 180-day approval cap. */
const VOTE_APPROVAL_LEDGERS = 120 * 17_280;
const buttons = css({ display: 'flex', justifyContent: 'flex-end', gap: '2' });
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { formatStroops } from '@/lib/auction-values';
import { estimateDate } from '@/lib/chain-reads/renewal';
import { daoRoute } from '@/lib/dao-routes';
import { directoryFetch } from '@/lib/member-directory/hooks';
import { holderTokenId, memberAddress } from '@/lib/member-directory/validation';
import { withArchivedRestore } from '@/lib/restore-archived-client';
import { currentTokenHolder } from '@/lib/token-holder/read';
import { assertHolderEnvelope, assertHolderSignedEnvelope, assertHolderWallet } from '@/lib/token-holder/transaction';
import type { HolderAction, HolderPrepared } from '@/lib/token-holder/types';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { readSigningWallet, signWithWallet } from '@/lib/wallet-sign';
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
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const { mutate } = useSWRConfig();
  const locked = config.tokenSettings.transfersLocked;
  const membersOnly = config.tokenSettings.membersOnlyDelegation;
  const [kind, setKind] = useState<HolderAction['action']>('transfer');
  const [typed, setDestination] = useState('');
  // A locked community: a token moves only back to the Treasury, or by a vote the Treasury runs.
  const fixedToTreasury = locked && (kind === 'transfer' || kind === 'approve');
  const destination = fixedToTreasury ? config.treasuryContractId : typed;
  const [expiry, setExpiry] = useState('');
  // The network's position when the end was last suggested, to show that end as a date.
  const [position, setPosition] = useState<{ sequence: number; at: number } | null>(null);
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
  /** An approval long enough for a proposal's whole timeline (delay, vote, queue, execution window). */
  async function suggestVoteApproval() {
    if (!allowed || inFlight.current || hash) return;
    inFlight.current = true;
    setBusy(true);
    clearReview();
    try {
      const { rpc } = await import('@stellar/stellar-sdk');
      const latest = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).getLatestLedger();
      setExpiry(String(holderTokenId(String(latest.sequence + VOTE_APPROVAL_LEDGERS))));
      setPosition({ sequence: latest.sequence, at: Date.now() });
      setMessage('Set to last about 120 days, long enough for a proposal to pass and run. Check it before signing.');
    } catch {
      setMessage("We couldn't read the network's current position. Try again, or enter an end yourself.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function suggestShortApproval() {
    if (!allowed || inFlight.current || hash) return;
    inFlight.current = true;
    setBusy(true);
    clearReview();
    try {
      const { rpc } = await import('@stellar/stellar-sdk');
      const latest = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).getLatestLedger();
      setExpiry(String(holderTokenId(String(latest.sequence + 120))));
      setPosition({ sequence: latest.sequence, at: Date.now() });
      setMessage('Set to end in about 10 minutes. Check it before signing.');
    } catch {
      setMessage("We couldn't read the network's current position. Try again, or enter an end yourself.");
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
      const prepared = await withArchivedRestore(
        () =>
          directoryFetch<HolderPrepared>(`/api/dao/${encodeURIComponent(daoId)}/tokens/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action)
          }),
        {
          address: useAuthSessionStore.getState().address ?? '',
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          onRestoring: setMessage
        }
      );
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
      setMessage('Looks good. Review the details below. Nothing is signed yet.');
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
      const [{ Client }, { TransactionBuilder, rpc }] = await Promise.all([
        import('@builder-stellar/token-bindings'),
        import('@stellar/stellar-sdk')
      ]);
      const [wallet, network] = await readSigningWallet();
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
          throw new Error('The approval end has passed. Set a new end and review again.');
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
      setMessage('Confirmed. Ownership and votes can take a moment to update here.');
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
  const endsAt = /^\d+$/.test(expiry) && position ? Number(expiry) : null;
  const endsAround =
    endsAt && position && endsAt > position.sequence
      ? estimateDate(endsAt, position.sequence, position.at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : null;
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
                ? 'Switch your wallet to this tribe’s network.'
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
          // On a locked community the only useful approval is one that outlasts a vote: suggest it.
          if (value === 'approve' && locked && !expiry) void suggestVoteApproval();
        }}
        options={
          locked
            ? [
                { value: 'transfer', label: 'Give back', description: 'Return this token to the tribe' },
                { value: 'delegate', label: 'Delegate votes', description: 'Let someone vote with your tokens' },
                { value: 'approve', label: 'Approve the tribe', description: 'Let a vote move this token' },
                { value: 'revoke', label: 'Revoke', description: 'Remove that approval' }
              ]
            : [
                { value: 'transfer', label: 'Send', description: 'Give this token to someone' },
                { value: 'delegate', label: 'Delegate votes', description: 'Let someone vote with your tokens' },
                { value: 'approve', label: 'Approve', description: 'Let an app move this token' },
                { value: 'revoke', label: 'Revoke', description: 'Remove that approval' }
              ]
        }
      />
      <div className={form}>
        {fixedToTreasury ? (
          <div>
            <p className={muted}>
              {kind === 'transfer'
                ? 'Memberships here are locked, so a token can only go back to the tribe. You stop being a member if it was your last one.'
                : 'Memberships here are locked. Approving the tribe lets a proposal members pass move this token, for example to a new wallet of yours.'}
            </p>
            <Address value={config.treasuryContractId} label="Tribe Treasury" compact />
          </div>
        ) : kind !== 'revoke' ? (
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
                {membersOnly
                  ? ' This tribe only lets you delegate to members: someone who holds a token that isn’t listed for sale.'
                  : ''}
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
            <FieldLabel htmlFor="holder-expiry">Approval ends at network position</FieldLabel>
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
              {endsAround
                ? `Ends around ${endsAround}. `
                : 'A number, not a date: the network moves on by one about every 5 seconds. '}
              {locked
                ? 'Until then, a proposal members pass can move this token, unless you revoke it first.'
                : 'The spender can move your token until then or until you revoke it.'}
            </FieldHelperText>
            <div>
              {locked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!allowed || busy || Boolean(hash)}
                  onClick={suggestVoteApproval}
                >
                  Last long enough for a vote (about 120 days)
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!allowed || busy || Boolean(hash)}
                  onClick={suggestShortApproval}
                >
                  Use a short approval (about 10 minutes)
                </Button>
              )}
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
            Network fee: {formatStroops(review.prepared.fee)} XLM. Nothing is signed until you press Sign.
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
          {confirmed && locked && kind === 'approve' ? (
            <p className={muted}>
              Next, ask the tribe to move it: a proposal with &quot;Approve a membership transfer&quot; names this
              token, your wallet and the new one. The approval lasts long enough for that vote.
            </p>
          ) : null}
          {confirmed && locked && kind === 'approve' ? (
            <div>
              <ButtonLink href={daoRoute(routeId, 'proposals/create')} size="sm">
                Draft the proposal
              </ButtonLink>
            </div>
          ) : null}
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
