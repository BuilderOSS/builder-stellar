'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useSWRConfig } from 'swr';

import { Address, Disclosure } from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { claimFetch, useClaimHistory, useCurrentClaims } from '@/lib/minter/hooks';
import { assertPreparedIdentity } from '@/lib/minter/identity';
import { parseProofFile, verifyClaimProof } from '@/lib/minter/proof';
import { assertClaimEnvelope } from '@/lib/minter/transaction';
import type { ClaimAction, ClaimState, PreparedClaim } from '@/lib/minter/types';
import { assertHolderSignedEnvelope, assertHolderWallet } from '@/lib/token-holder/transaction';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { AllocationDraftForm } from './allocation-draft';
import styles from './claims-styles';

export function Claims({ admin = false }: { admin?: boolean }) {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const current = useCurrentClaims(config.tokenContractId, address);
  const [page, setPage] = useState(0);
  const history = useClaimHistory(config.tokenContractId, page);
  const { mutate } = useSWRConfig();
  const [proofText, setProofText] = useState('');
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
  const base = `/dao/${encodeURIComponent(daoId)}`;

  async function prepare(method: ClaimAction['method']) {
    if (!allowed || !data || lock.current || hash) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setMessage('Checking current allocation and simulating…');
    try {
      const round = data[method].round;
      if (round === null) throw new Error('Current round is unavailable. Refresh before claiming.');
      const action: ClaimAction =
        method === 'allowlist' ? { method, round } : { method, round, ...parseProofFile(proofText) };
      if (
        action.method === 'merkle' &&
        (!data.merkle.root || !address || !verifyClaimProof(address, action.amount, action.proof, data.merkle.root))
      )
        throw new Error(
          'Proof does not match your account, amount and current root. Obtain the proof from the allocation organizer.'
        );
      const prepared = await claimFetch<PreparedClaim>(`${base.replace('/dao/', '/api/dao/')}/claims/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      const nowSession = useAuthSessionStore.getState();
      if (nowSession.authStatus !== 'authenticated') throw new Error('Authenticate again before reviewing.');
      assertPreparedIdentity(prepared, config, DEPLOYMENT_ID, nowSession.address, data.minterContractId!);
      if (method === 'allowlist' && prepared.amount !== data.allowlist.amount)
        throw new Error('The allowlist amount changed. Refresh and review again.');
      const { TransactionBuilder } = await import('@stellar/stellar-sdk');
      assertClaimEnvelope(TransactionBuilder.fromXDR(prepared.xdr, config.passphrase), prepared, action);
      setReview({ action, prepared, state: data });
      setMessage('Simulation passed. No signature or submission yet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Claim preparation failed.');
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
      const [{ StellarWalletsKit }, { TransactionBuilder, rpc }] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@stellar/stellar-sdk')
      ]);
      const [wallet, network, latest] = await Promise.all([
        StellarWalletsKit.getAddress(),
        StellarWalletsKit.getNetwork(),
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
        latest[action.method].round !== prepared.round ||
        latest[action.method].claimed === true ||
        (action.method === 'merkle'
          ? latest.merkle.root !== state.merkle.root
          : latest.allowlist.amount !== prepared.amount)
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
      setMessage('Claim confirmed. Indexed history may take a moment to catch up.');
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
          <Link href={{ pathname: `${base}/${admin ? 'claims' : 'admin/claims'}` }}>
            {admin ? 'See the member view' : 'Manage allocations'}
          </Link>
          <button
            disabled={busy}
            onClick={() => {
              setReview(null);
              void current.mutate();
              void history.mutate();
            }}
          >
            Refresh
          </button>
        </div>
        {current.isLoading ? <p role="status">Checking what you can claim…</p> : null}
        {current.error ? <p role="alert">{current.error.message}</p> : null}
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
              <p className={styles.muted}>
                A missing entry may be absent or archived, not proof it&apos;s unclaimed; we check before you sign. Each
                method has its own round, and a new allocation lets earlier recipients claim again.
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
            <h2>On the list</h2>
            <p>
              {data?.allowlist.amount != null ? `${data.allowlist.amount} tokens each` : 'Amount unavailable'} · round{' '}
              {data?.allowlist.round ?? '–'}
            </p>
            <p>
              You: {marker(data?.allowlist.member, 'on the list', 'not on the list')}
              <br />
              Status: {marker(data?.allowlist.claimed, 'already claimed', 'not claimed yet')}
            </p>
            <button
              disabled={
                !allowed ||
                busy ||
                Boolean(hash) ||
                data?.allowlist.round == null ||
                data?.allowlist.amount == null ||
                data?.allowlist.claimed === true
              }
              onClick={() => prepare('allowlist')}
            >
              Claim
            </button>
          </section>
          <section className={styles.panel}>
            <h2>Claim with a proof</h2>
            <p>
              Status: {marker(data?.merkle.claimed, 'already claimed', 'not claimed yet')} · round{' '}
              {data?.merkle.round ?? '–'}
            </p>
            <p className={styles.address}>Root: {data?.merkle.root ?? 'unavailable'}</p>
            <p>
              The organizer gives you a small proof file with your amount. Upload it or paste it below; we check it
              before you sign.
            </p>
            <label>
              Proof file
              <input
                type="file"
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
                    setMessage('Proof loaded. Review to validate against the current root.');
                  } catch (error) {
                    setProofText('');
                    setMessage(error instanceof Error ? error.message : 'Invalid proof file.');
                  }
                }}
              />
            </label>
            <label>
              Or paste it
              <textarea
                value={proofText}
                placeholder={'{"amount":"5","proof":[]}'}
                disabled={busy || Boolean(hash)}
                onChange={(event) => {
                  setProofText(event.target.value);
                  setReview(null);
                }}
              />
            </label>
            <button
              disabled={
                !allowed ||
                busy ||
                Boolean(hash) ||
                !proofText ||
                !data?.merkle.root ||
                data.merkle.round === null ||
                data.merkle.claimed === true
              }
              onClick={() => prepare('merkle')}
            >
              Check proof
            </button>
          </section>
        </div>
      )}
      {review ? (
        <section className={`${styles.panel} ${styles.review}`} aria-label="Claim transaction review">
          <h2>Claim {review.prepared.amount} tokens</h2>
          <p>
            Network fee: {review.prepared.fee} stroops (10,000,000 stroops = 1 XLM). The tokens themselves are free.
          </p>
          <Disclosure title="Technical details">
            <p>
              Method: {review.prepared.method} · round {review.prepared.round}. Signing authorizes the Minter claim and
              its batch mint; smart-account signing isn&apos;t supported.
            </p>
            <Address value={review.prepared.address} label="Recipient and signer" />
            <Address value={review.prepared.tokenContractId} label="Token" />
            <Address value={review.prepared.minterContractId} label="Minter" />
          </Disclosure>
          <div className={styles.row}>
            <button disabled={busy || !allowed} onClick={sign}>
              Sign and claim
            </button>
            <button disabled={busy} onClick={() => setReview(null)}>
              Cancel
            </button>
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
          <p role="alert">{history.error.message}</p>
        ) : history.isLoading ? (
          <p role="status">Loading past claims…</p>
        ) : history.data ? (
          <>
            <p>{history.data.total} claims so far.</p>
            {history.data.items.length ? (
              <ul className={styles.history}>
                {history.data.items.map((item) => (
                  <li key={item.claim_id}>
                    <p>
                      {item.amount ?? 'Some'} tokens · {item.claim_type === 'merkle' ? 'with a proof' : 'from the list'}{' '}
                      · ledger {item.ledger_sequence}
                    </p>
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
            <div className={styles.row}>
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>Page {page + 1}</span>
              <button disabled={!history.data.hasMore || page >= 5000} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function marker(value: boolean | null | undefined, yes: string, no: string) {
  return value === true ? yes : value === false ? no : 'unknown (we check before you sign)';
}

function AllocationInfo({ state }: { state?: ClaimState }) {
  return (
    <section className={styles.panel}>
      <h2>Admin / governance allocation configuration</h2>
      <p>
        Only the current Token admin can set an allowlist, set a Merkle root, or batch mint. These methods require a
        Live token; setup allocations cannot be configured before launch. After launch the admin is normally the
        Treasury, so changes must execute through governance.
      </p>
      <p>
        Setting a root starts a new Merkle round only. Replacing the allowlist starts a new allowlist round only; every
        listed address receives the same fixed positive amount. Neither method accepts payment currency.
      </p>
      <p>
        Current rounds: Merkle {state?.merkle.round ?? 'unavailable'}, allowlist{' '}
        {state?.allowlist.round ?? 'unavailable'}.
      </p>
      <p role="note">
        Governance submission is not enabled on this page: the shared proposal encoder/registry does not support Minter
        targets yet. Validated, unregistered allocation action descriptors are available for lead integration. No admin
        transaction is signed here.
      </p>
      <AllocationDraftForm state={state} />
    </section>
  );
}
