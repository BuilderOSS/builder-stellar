'use client';

import { RefreshCw, Upload } from 'lucide-react';
import type { Route } from 'next';
import { useRef, useState } from 'react';
import { css } from 'styled-system/css';
import { useSWRConfig } from 'swr';

import {
  Address,
  Button,
  ButtonLink,
  Callout,
  Disclosure,
  Field,
  FieldLabel,
  Pagination,
  Textarea
} from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { formatStroops } from '@/lib/auction-values';
import { claimFetch, useClaimHistory, useCurrentClaims } from '@/lib/minter/hooks';
import { assertPreparedIdentity } from '@/lib/minter/identity';
import { parseProofFile, verifyClaimProof } from '@/lib/minter/proof';
import { assertClaimEnvelope } from '@/lib/minter/transaction';
import type { ClaimAction, ClaimState, PreparedClaim } from '@/lib/minter/types';
import { assertHolderSignedEnvelope, assertHolderWallet } from '@/lib/token-holder/transaction';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { readSigningWallet, signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { AllocationDraftForm } from './allocation-draft';
import styles from './claims-styles';

export function Claims({ admin = false }: { admin?: boolean }) {
  const { daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const current = useCurrentClaims(config.tokenContractId, address);
  const [page, setPage] = useState(0);
  const history = useClaimHistory(config.tokenContractId, page);
  const { mutate } = useSWRConfig();
  const [proofText, setProofText] = useState('');
  const proofInput = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<{ action: ClaimAction; prepared: PreparedClaim; state: ClaimState } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [hash, setHash] = useState('');
  const lock = useRef(false);
  const data = current.data;
  const allowed = Boolean(
    !current.error &&
    !current.isLoading &&
    data?.authenticated &&
    data.address === address &&
    data.live &&
    data.mintAuthority &&
    data.minterContractId &&
    !session.walletNetworkIssue &&
    session.walletNetworkPassphrase === config.passphrase
  );
  const base = `/dao/${encodeURIComponent(routeId)}`;

  /** Claim with the verified list's entry for this wallet, or with a pasted proof file. */
  async function prepare(source: 'list' | 'file') {
    if (!allowed || !data || lock.current || hash) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setMessage('Checking current allocation and simulating…');
    try {
      const round = data.merkle.round;
      if (round === null) throw new Error('Current round is unavailable. Refresh before claiming.');
      const entry = data.claimList.status === 'verified' ? data.claimList.entry : null;
      if (source === 'list' && !entry) throw new Error('You are not on the current claim list.');
      const action: ClaimAction =
        source === 'list' && entry
          ? { method: 'merkle', round, amount: entry.amount, proof: entry.proof }
          : { method: 'merkle', round, ...parseProofFile(proofText) };
      if (!data.merkle.root || !address || !verifyClaimProof(address, action.amount, action.proof, data.merkle.root))
        throw new Error(
          'This proof doesn’t match your account, amount or the current claim list. Ask whoever runs the claim for a new one.'
        );
      const prepared = await claimFetch<PreparedClaim>(`${base.replace('/dao/', '/api/dao/')}/claims/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      const nowSession = useAuthSessionStore.getState();
      if (nowSession.authStatus !== 'authenticated') throw new Error('Authenticate again before reviewing.');
      assertPreparedIdentity(prepared, config, DEPLOYMENT_ID, nowSession.address, data.minterContractId!);
      const { TransactionBuilder } = await import('@stellar/stellar-sdk');
      assertClaimEnvelope(TransactionBuilder.fromXDR(prepared.xdr, config.passphrase), prepared, action);
      setReview({ action, prepared, state: data });
      setMessage('Looks good. Nothing is signed or sent yet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't prepare your claim.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function sign() {
    if (!review || !allowed || lock.current || hash) return;
    lock.current = true;
    setBusy(true);
    const { action, prepared, state } = review;
    try {
      const [{ TransactionBuilder, rpc }] = await Promise.all([import('@stellar/stellar-sdk')]);
      const [[wallet, network], latest] = await Promise.all([
        readSigningWallet(),
        claimFetch<ClaimState>(`${base.replace('/dao/', '/api/dao/')}/claims`)
      ]);
      const nowSession = useAuthSessionStore.getState();
      if (nowSession.authStatus !== 'authenticated' || nowSession.address !== prepared.address)
        throw new Error('Authenticate the reviewed account again.');
      assertHolderWallet(wallet.address, network.networkPassphrase, prepared.address, config.passphrase);
      assertPreparedIdentity(prepared, config, DEPLOYMENT_ID, nowSession.address, latest.minterContractId ?? '');
      if (
        !latest.authenticated ||
        latest.address !== prepared.address ||
        latest.deploymentId !== DEPLOYMENT_ID ||
        latest.daoId !== prepared.daoId ||
        !latest.live ||
        !latest.mintAuthority ||
        latest.merkle.round !== prepared.round ||
        latest.merkle.claimed === true ||
        latest.merkle.root !== state.merkle.root
      )
        throw new Error('Eligibility or allocation changed. Refresh and simulate again.');
      const unsigned = TransactionBuilder.fromXDR(prepared.xdr, config.passphrase);
      assertClaimEnvelope(unsigned, prepared, action);
      setMessage('Waiting for your wallet signature…');
      const signed = await signWithWallet(prepared.xdr, {
        address: prepared.address,
        networkPassphrase: config.passphrase
      });
      if (signed.signerAddress && signed.signerAddress !== prepared.address)
        throw new Error('Wallet signed with another account. Nothing was submitted.');
      if (
        useAuthSessionStore.getState().address !== prepared.address ||
        useAuthSessionStore.getState().authStatus !== 'authenticated'
      )
        throw new Error('Session changed. Nothing was submitted.');
      const transaction = TransactionBuilder.fromXDR(signed.signedTxXdr, config.passphrase);
      const txHash = assertHolderSignedEnvelope(unsigned, transaction);
      setHash(txHash);
      setReview(null);
      setMessage('Submitting. Check this hash before any retry.');
      const submitted = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).sendTransaction(
        transaction
      );
      if (submitted.hash !== txHash || submitted.status === 'ERROR' || submitted.status === 'TRY_AGAIN_LATER')
        throw new Error('Submission was not accepted. Check the transaction hash before retrying.');
      setMessage('Submitted. Waiting for confirmation…');
      await waitForConfirmation(txHash, config.rpcUrl);
      setMessage('Claim confirmed. Your claim history can take a moment to catch up.');
      await mutate(
        (key) =>
          Array.isArray(key) &&
          ['minter', 'member-directory', 'token-holder'].includes(key[0]) &&
          key[1] === DEPLOYMENT_ID &&
          key[2] === config.tokenContractId
      );
    } catch (error) {
      setReview(null);
      setMessage(error instanceof Error ? error.message : 'Claim failed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.surface}>
      <section className={styles.panel}>
        <h1>{admin ? 'Claim allocations' : 'Claim your tokens'}</h1>
        <p>
          Some communities set aside free tokens for specific people. If one is waiting for you, claim it here. You only
          pay a small network fee in XLM.
        </p>
        <div className={styles.row}>
          <ButtonLink href={`${base}/${admin ? 'claims' : 'admin/claims'}` as Route} variant="secondary" size="sm">
            {admin ? 'See the member view' : 'Manage allocations'}
          </ButtonLink>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setReview(null);
              void current.mutate();
              void history.mutate();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </div>
        {current.isLoading ? <p role="status">Checking what you can claim…</p> : null}
        {current.error ? (
          <Callout variant="error" title="Claims didn't load" description={current.error.message} />
        ) : null}
        {data ? (
          <>
            {!data.live ? <p>Claims open once the community launches.</p> : null}
            {!data.authenticated ? <p>Connect the wallet that was given tokens to claim them.</p> : null}
            <Disclosure title="Technical details">
              <p>
                Token: {data.live ? 'live' : 'in setup'} · Minter can mint: {data.mintAuthority ? 'yes' : 'no'}
              </p>
              {data.minterContractId ? (
                <Address value={data.minterContractId} label="Minter" />
              ) : (
                <p>Minter: not registered</p>
              )}
              <Address value={data.tokenContractId} label="Token" />
              <Address value={data.admin} label="Admin" />
              {data.authenticated && data.address ? <Address value={data.address} label="Signed in as" /> : null}
              <p className={styles.address}>Root: {data.merkle.root ?? 'none'}</p>
              {data.merkle.treeUri ? <p className={styles.address}>Claim list: {data.merkle.treeUri}</p> : null}
              <p className={styles.muted}>
                A missing entry may be absent or archived, not proof it&apos;s unclaimed; we check before you sign. A
                new claim list opens a new round, and earlier recipients may claim again.
              </p>
            </Disclosure>
          </>
        ) : null}
        {!allowed && !admin ? (
          <p>
            To claim you need the right wallet connected, a launched community, and the community&apos;s claims turned
            on.
          </p>
        ) : null}
      </section>
      {admin ? (
        <AllocationInfo state={current.error ? undefined : data} />
      ) : (
        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2>Your claim</h2>
            <ClaimListSummary state={data} />
            {data?.claimList.status === 'verified' && data.claimList.entry ? (
              <div>
                <Button
                  disabled={!allowed || busy || Boolean(hash) || data.merkle.claimed === true}
                  onClick={() => prepare('list')}
                >
                  {data.merkle.claimed === true ? 'Already claimed' : `Claim ${data.claimList.entry.amount} tokens`}
                </Button>
              </div>
            ) : null}
          </section>
          <section className={styles.panel}>
            <Disclosure title="Have a proof file instead?">
              <p>
                If the claim list can&apos;t be loaded, the organizer can give you a small proof file with your amount.
                We check it against the current round before you sign.
              </p>
              <Field>
                <FieldLabel htmlFor="claim-proof-file">Proof file</FieldLabel>
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || Boolean(hash)}
                    onClick={() => proofInput.current?.click()}
                  >
                    <Upload aria-hidden="true" />
                    Choose a proof file
                  </Button>
                </div>
                <input
                  ref={proofInput}
                  id="claim-proof-file"
                  type="file"
                  hidden
                  accept=".json,application/json"
                  disabled={busy || Boolean(hash)}
                  onChange={async (event) => {
                    setReview(null);
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 8192) throw new Error('Proof file exceeds 8 KB.');
                      const text = await file.text();
                      parseProofFile(text);
                      setProofText(text);
                      setMessage('Proof loaded. Review to validate against the current round.');
                    } catch (error) {
                      setProofText('');
                      setMessage(error instanceof Error ? error.message : 'Invalid proof file.');
                    }
                    event.target.value = '';
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="claim-proof-text">Or paste it</FieldLabel>
                <Textarea
                  id="claim-proof-text"
                  className={css({ textStyle: 'mono', fontSize: '0.8125rem' })}
                  value={proofText}
                  placeholder={'{"amount":"5","proof":[]}'}
                  disabled={busy || Boolean(hash)}
                  onChange={(event) => {
                    setProofText(event.target.value);
                    setReview(null);
                  }}
                />
              </Field>
              <div>
                <Button
                  variant="secondary"
                  disabled={
                    !allowed ||
                    busy ||
                    Boolean(hash) ||
                    !proofText ||
                    !data?.merkle.root ||
                    data.merkle.round === null ||
                    data.merkle.claimed === true
                  }
                  onClick={() => prepare('file')}
                >
                  Check proof
                </Button>
              </div>
            </Disclosure>
          </section>
        </div>
      )}
      {review ? (
        <section className={`${styles.panel} ${styles.review}`} aria-label="Claim transaction review">
          <h2>Claim {review.prepared.amount} tokens</h2>
          <p>Network fee: {formatStroops(review.prepared.fee)} XLM. The tokens themselves are free.</p>
          <Disclosure title="Technical details">
            <p>
              Claim round {review.prepared.round}. Signing authorizes the Minter claim and its mint; smart-account
              signing isn&apos;t supported.
            </p>
            <Address value={review.prepared.address} label="Recipient and signer" />
            <Address value={review.prepared.tokenContractId} label="Token" />
            <Address value={review.prepared.minterContractId} label="Minter" />
          </Disclosure>
          <div className={styles.row}>
            <Button variant="ghost" disabled={busy} onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button disabled={!allowed} loading={busy} onClick={sign}>
              Sign and claim
            </Button>
          </div>
        </section>
      ) : null}
      {message || hash ? (
        <section className={styles.panel}>
          <p role="status" aria-live="polite">
            {message}
          </p>
          {hash ? (
            <>
              <Address value={hash} label="Transaction" />
              <p>Don&apos;t claim again while this is confirming. Check the transaction before trying again.</p>
            </>
          ) : null}
        </section>
      ) : null}
      <section className={styles.panel}>
        <h2>Past claims</h2>
        <p>
          Every successful claim, across all rounds. It doesn&apos;t tell you whether you can claim in the current
          round.
        </p>
        {history.error ? (
          <Callout variant="error" title="Past claims didn't load" description={history.error.message} />
        ) : history.isLoading ? (
          <p role="status">Loading past claims…</p>
        ) : history.data ? (
          <>
            <p>{history.data.total} claims so far.</p>
            {history.data.items.length ? (
              <ul className={styles.history}>
                {history.data.items.map((item) => (
                  <li key={item.claim_id}>
                    <p>{item.amount ?? 'Some'} tokens</p>
                    {item.recipient ? <Address value={item.recipient} label="Recipient" compact /> : null}
                    {item.transaction_hash ? (
                      <Address value={item.transaction_hash} label="Transaction" compact />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No claims yet. A claim you just made can take a moment to show up.</p>
            )}
            <Pagination
              label="Past claim pages"
              page={page + 1}
              hasPrevious={page > 0}
              hasNext={Boolean(history.data.hasMore) && page < 5000}
              onPrevious={() => setPage(page - 1)}
              onNext={() => setPage(page + 1)}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

function marker(value: boolean | null | undefined, yes: string, no: string) {
  return value === true ? yes : value === false ? no : 'unknown (we check before you sign)';
}

/** What the current claim list says about the connected wallet. */
function ClaimListSummary({ state }: { state?: ClaimState }) {
  if (!state) return null;
  const list = state.claimList;
  if (list.status === 'none') return <p>No claim round is open right now.</p>;
  if (list.status === 'unavailable')
    return (
      <Callout
        variant="warning"
        title="Claim list unavailable"
        description={`${list.reason} You can still claim with a proof file from the organizer.`}
      />
    );
  if (!state.authenticated) return <p>Connect the wallet that was given tokens to see your claim.</p>;
  if (!list.entry)
    return (
      <p>
        You&apos;re not on this round&apos;s list. {list.recipients.toLocaleString()} people can claim {list.tokenTotal}{' '}
        tokens in round {state.merkle.round}.
      </p>
    );
  return (
    <p>
      {list.entry.amount} tokens are waiting for you in round {state.merkle.round}. Status:{' '}
      {marker(state.merkle.claimed, 'already claimed', 'not claimed yet')}.
    </p>
  );
}

function AllocationInfo({ state }: { state?: ClaimState }) {
  return (
    <section className={styles.panel}>
      <h2>Claim rounds</h2>
      <p>
        A claim round gives listed people tokens they claim themselves. You build the list here; it is published to IPFS
        so anyone can check it, and a proposal opens the round with its root. Batch allocation mints to up to 18 people
        at once instead. Both need the community to be live, and after launch they go through a vote.
      </p>
      <p>
        Current round: {state?.merkle.round ?? 'none'}
        {state?.claimList.status === 'verified'
          ? ` · ${state.claimList.recipients.toLocaleString()} people, ${state.claimList.tokenTotal} tokens`
          : state?.claimList.status === 'unavailable'
            ? ' · claim list unavailable'
            : ''}
        .
      </p>
      <AllocationDraftForm state={state} />
    </section>
  );
}
