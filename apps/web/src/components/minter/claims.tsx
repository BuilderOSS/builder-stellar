'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { RefreshCw, Upload } from 'lucide-react';
import type { Route } from 'next';
import { useRef, useState } from 'react';
import { css } from 'styled-system/css';
import { useSWRConfig } from 'swr';

import {
  Address,
  Badge,
  Button,
  ButtonLink,
  Callout,
  Disclosure,
  Field,
  FieldLabel,
  Pagination,
  ProgressBar,
  Textarea
} from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { formatStroops } from '@/lib/auction-values';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { claimMinterClient } from '@/lib/minter/client';
import { sendAndConfirm, walletClientOptions } from '@/lib/minter/direct';
import {
  claimAmountLabel,
  claimPriceLabel,
  formatClaimDate,
  listPhase,
  nextClaimCount,
  remainingAllocation
} from '@/lib/minter/display';
import { claimFetch, useClaimHistory, useCurrentClaims } from '@/lib/minter/hooks';
import { assertPreparedIdentity } from '@/lib/minter/identity';
import { MAX_CLAIM_PER_CALL } from '@/lib/minter/limits';
import { parseProofFile, verifyClaimProof } from '@/lib/minter/proof';
import { assertClaimEnvelope } from '@/lib/minter/transaction';
import type { ClaimAction, ClaimListView, ClaimState, PreparedClaim } from '@/lib/minter/types';
import { withArchivedRestore } from '@/lib/restore-archived-client';
import { assertHolderSignedEnvelope, assertHolderWallet } from '@/lib/token-holder/transaction';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { readSigningWallet, signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { ClaimListDraftForm } from './allocation-draft';
import styles from './claims-styles';

type Entry = { amount: string; proof: string[] };
type Review = { action: ClaimAction; prepared: PreparedClaim; list: ClaimListView };

function listName(list: Pick<ClaimListView, 'listId' | 'assurance'>) {
  return list.assurance ? 'Launch drive' : `Claim list ${list.listId + 1}`;
}

/** How many tokens one claim with this entry mints now: the rest of the allocation, capped. */
function claimCount(list: ClaimListView, entry: Entry) {
  const left = BigInt(entry.amount) - BigInt(list.claimed ?? 0);
  const listLeft = BigInt(Math.max(0, list.total - list.minted));
  const counts = [left, listLeft, BigInt(MAX_CLAIM_PER_CALL)];
  return Number(counts.reduce((low, value) => (value < low ? value : low)));
}

export function Claims({ admin = false }: { admin?: boolean }) {
  const { daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const current = useCurrentClaims(config.tokenContractId, address);
  const [page, setPage] = useState(0);
  const history = useClaimHistory(config.tokenContractId, page);
  const { mutate } = useSWRConfig();
  const tx = useTransactionFeedback(config.name);
  const [proofText, setProofText] = useState('');
  const proofInput = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [hash, setHash] = useState('');
  const lock = useRef(false);
  const data = current.data;
  const signedIn = Boolean(
    !current.error &&
    !current.isLoading &&
    data?.authenticated &&
    data.address === address &&
    !session.walletNetworkIssue &&
    session.walletNetworkPassphrase === config.passphrase
  );
  const canClaim = signedIn && Boolean(data?.claimsContractId);
  const base = `/dao/${encodeURIComponent(routeId)}`;
  const api = `/api/dao/${encodeURIComponent(config.tokenContractId)}/claims`;

  async function refreshAll() {
    await mutate(
      (key) =>
        Array.isArray(key) &&
        ['minter', 'member-directory', 'token-holder'].includes(key[0]) &&
        key[1] === DEPLOYMENT_ID &&
        key[2] === config.tokenContractId
    );
  }

  /** Simulate a claim of the next batch of this entry on the server, then check it before showing it. */
  async function prepare(list: ClaimListView, entry: Entry) {
    if (!canClaim || !data?.claimsContractId || !address || lock.current || hash) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setMessage('Checking the list and simulating your claim…');
    try {
      if (listPhase(list) !== 'open') throw new Error('This list is not taking claims.');
      if (!verifyClaimProof(address, entry.amount, entry.proof, list.root))
        throw new Error(
          'This proof doesn’t match your account, amount or the list. Ask whoever runs the claim for a new one.'
        );
      const mintNow = claimCount(list, entry);
      if (mintNow < 1) throw new Error('Nothing is left to claim on this list.');
      const action: ClaimAction = {
        listId: list.listId,
        leafAmount: entry.amount,
        mintNow,
        proof: entry.proof,
        maxPrice: list.price
      };
      const prepared = await withArchivedRestore(
        () =>
          claimFetch<PreparedClaim>(`${api}/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action)
          }),
        { address, rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase, onRestoring: setMessage }
      );
      const nowSession = useAuthSessionStore.getState();
      if (nowSession.authStatus !== 'authenticated') throw new Error('Authenticate again before reviewing.');
      assertPreparedIdentity(prepared, config, DEPLOYMENT_ID, nowSession.address, data.claimsContractId);
      if (prepared.asset !== list.asset || prepared.cost !== (BigInt(list.price) * BigInt(mintNow)).toString())
        throw new Error('The prepared price differs from the list. Nothing was signed.');
      const { TransactionBuilder } = await import('@stellar/stellar-sdk');
      assertClaimEnvelope(TransactionBuilder.fromXDR(prepared.xdr, config.passphrase), prepared, action);
      setReview({ action, prepared, list });
      setMessage('Looks good. Nothing is signed or sent yet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't prepare your claim.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  /** The proof file names no list: use the open list whose root it proves against. */
  function prepareFromFile() {
    if (!data || !address) return;
    try {
      const entry = parseProofFile(proofText);
      const list = data.lists.find(
        (item) => listPhase(item) === 'open' && verifyClaimProof(address, entry.amount, entry.proof, item.root)
      );
      if (!list) throw new Error('This proof matches none of the open lists for your account.');
      void prepare(list, entry);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid proof file.');
    }
  }

  async function sign() {
    if (!review || !canClaim || lock.current || hash) return;
    lock.current = true;
    setBusy(true);
    const { action, prepared, list } = review;
    try {
      const { TransactionBuilder, rpc } = await import('@stellar/stellar-sdk');
      const [[wallet, network], latest] = await Promise.all([readSigningWallet(), claimFetch<ClaimState>(api)]);
      const nowSession = useAuthSessionStore.getState();
      if (nowSession.authStatus !== 'authenticated' || nowSession.address !== prepared.address)
        throw new Error('Authenticate the reviewed account again.');
      assertHolderWallet(wallet.address, network.networkPassphrase, prepared.address, config.passphrase);
      assertPreparedIdentity(prepared, config, DEPLOYMENT_ID, nowSession.address, latest.claimsContractId ?? '');
      const again = latest.lists.find((item) => item.listId === prepared.listId);
      if (
        !latest.authenticated ||
        latest.address !== prepared.address ||
        latest.deploymentId !== DEPLOYMENT_ID ||
        latest.daoId !== prepared.daoId ||
        !again ||
        again.root !== list.root ||
        again.price !== list.price ||
        again.claimed !== list.claimed ||
        listPhase(again) !== 'open'
      )
        throw new Error('The list or your claims changed. Refresh and simulate again.');
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
      setHash('');
      setMessage('Claim confirmed. Your claim history can take a moment to catch up.');
      await refreshAll();
    } catch (error) {
      setReview(null);
      setMessage(error instanceof Error ? error.message : 'Claim failed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  /** `refund` and `launch_when_ready` are open to anyone and move nothing but the caller's own refund. */
  async function direct(label: string, run: () => Promise<string>) {
    if (!signedIn || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      tx.start(label);
      tx.success(label, await run());
      await refreshAll();
    } catch (error) {
      tx.fail(error, `${label} failed`, label === 'Launch the community' ? 'manager' : 'minter');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function refund(list: ClaimListView) {
    if (!address || !data?.claimsContractId) return;
    const client = claimMinterClient(walletClientOptions(config, address, data.claimsContractId));
    void direct('Take back your payment', async () =>
      sendAndConfirm(await client.refund({ list_id: list.listId, claimer: address }), config.rpcUrl)
    );
  }

  function launch() {
    if (!address) return;
    const manager = new ManagerClient(walletClientOptions(config, address, getDeploymentConfig().managerAddress));
    void direct('Launch the community', async () =>
      sendAndConfirm(await manager.launch_when_ready({ token_address: config.tokenContractId }), config.rpcUrl)
    );
  }

  const openLists = data?.lists.filter((list) => listPhase(list) === 'open') ?? [];

  return (
    <div className={styles.surface}>
      <section className={styles.panel}>
        <h1>{admin ? 'Claim lists' : 'Claim your tokens'}</h1>
        <p>
          A community can set aside tokens for specific people. If you are on one of its claim lists, claim your tokens
          here. Some lists are free; others charge a price per token. You also pay a small network fee in XLM.
        </p>
        <div className={styles.row}>
          <ButtonLink href={`${base}/${admin ? 'claims' : 'admin/claims'}` as Route} variant="secondary" size="sm">
            {admin ? 'See the member view' : 'Manage claim lists'}
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
        {data && !data.claimsContractId ? <Callout variant="info" title="This community has no claims module" /> : null}
        {data && !data.authenticated && !admin ? (
          <p>Connect the wallet that is on a claim list to see your tokens.</p>
        ) : null}
        {data ? (
          <Disclosure title="Technical details">
            <p>Community: {data.live ? 'live' : 'in setup'}</p>
            {data.claimsContractId ? <Address value={data.claimsContractId} label="Claims module" /> : null}
            <p>
              Mint allowance:{' '}
              {data.allowance === null
                ? 'none'
                : data.allowance >= 0xffffffff
                  ? 'unlimited'
                  : `${data.allowance.toLocaleString()} tokens`}
            </p>
            <Address value={data.tokenContractId} label="Token" />
            <Address value={data.admin} label="Admin" />
            {data.authenticated && data.address ? <Address value={data.address} label="Signed in as" /> : null}
            <p className={styles.muted}>
              Your claims are read from the claims module before you sign. The newest lists are shown here; older ones
              stay in the claim history.
            </p>
          </Disclosure>
        ) : null}
      </section>

      {data?.claimsContractId ? (
        data.lists.length ? (
          <div className={styles.grid}>
            {data.lists.map((list) => (
              <ClaimListCard
                key={list.listId}
                list={list}
                state={data}
                admin={admin}
                disabled={!canClaim || busy || Boolean(hash)}
                onClaim={(entry) => void prepare(list, entry)}
                onRefund={() => refund(list)}
                onLaunch={launch}
              />
            ))}
          </div>
        ) : (
          <section className={styles.panel}>
            <p>No claim lists yet.</p>
          </section>
        )
      ) : null}

      {admin && data?.claimsContractId ? (
        <section className={styles.panel}>
          <ClaimListDraftForm state={current.error ? undefined : data} onOpened={() => void refreshAll()} />
        </section>
      ) : null}

      {!admin && openLists.length ? (
        <section className={styles.panel}>
          <Disclosure title="Have a proof file instead?">
            <p>
              If a claim list can&apos;t be loaded, the organizer can give you a small proof file with your amount. We
              check it against the open lists before you sign.
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
                    setMessage('Proof loaded. Check it to find its list.');
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
                disabled={!canClaim || busy || Boolean(hash) || !proofText}
                onClick={prepareFromFile}
              >
                Check proof
              </Button>
            </div>
          </Disclosure>
        </section>
      ) : null}

      {review ? (
        <section className={`${styles.panel} ${styles.review}`} aria-label="Claim transaction review">
          <h2>
            Claim {review.prepared.mintNow} {review.prepared.mintNow === 1 ? 'token' : 'tokens'}
          </h2>
          <p>
            {BigInt(review.prepared.cost) === 0n
              ? 'The tokens are free.'
              : `You pay ${claimAmountLabel(config.name, review.prepared.asset, review.prepared.cost)}${
                  review.list.assurance && !data?.live
                    ? ', held by the claims module until the community launches. If the drive fails, you can take it back.'
                    : ', sent to the community Treasury.'
                }`}{' '}
            Network fee: {formatStroops(review.prepared.fee)} XLM.
          </p>
          {BigInt(review.prepared.leafAmount) - BigInt(review.list.claimed ?? 0) > BigInt(review.prepared.mintNow) ? (
            <p>
              Your allocation is {review.prepared.leafAmount} tokens. One claim mints at most {MAX_CLAIM_PER_CALL};
              claim again for the rest.
            </p>
          ) : null}
          <Disclosure title="Technical details">
            <p>
              {listName(review.list)}. Signing authorizes the claim, its payment and its mint; smart-account signing
              isn&apos;t supported.
            </p>
            <Address value={review.prepared.address} label="Recipient and signer" />
            <Address value={review.prepared.tokenContractId} label="Token" />
            <Address value={review.prepared.claimsContractId} label="Claims module" />
          </Disclosure>
          <div className={styles.row}>
            <Button variant="ghost" disabled={busy} onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button disabled={!canClaim} loading={busy} onClick={sign}>
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
        <p>Every successful claim, across all lists.</p>
        {history.error ? (
          <Callout variant="error" title="Past claims didn't load" description={history.error.message} />
        ) : history.isLoading ? (
          <p role="status">Loading past claims…</p>
        ) : history.data ? (
          <>
            <p>{history.data.total} claims so far.</p>
            {history.data.items.length ? (
              <ul className={styles.history}>
                {history.data.items.map((item) => {
                  const list = data?.lists.find((entry) => entry.listId === item.list_id);
                  const paid = item.paid && BigInt(item.paid) > 0n ? item.paid : null;
                  return (
                    <li key={item.claim_id}>
                      <p>
                        {item.amount ?? 'Some'} tokens from{' '}
                        {listName(list ?? { listId: item.list_id, assurance: null })}
                        {paid && list ? `, paid ${claimAmountLabel(config.name, list.asset, paid)}` : ''}
                        {item.escrowed ? ' (held until launch)' : ''}
                      </p>
                      {item.recipient ? <Address value={item.recipient} label="Recipient" compact /> : null}
                      {item.transaction_hash ? (
                        <Address value={item.transaction_hash} label="Transaction" compact />
                      ) : null}
                    </li>
                  );
                })}
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

/** One list: its terms, a launch drive's progress, and what the connected wallet can do on it. */
function ClaimListCard({
  list,
  state,
  admin,
  disabled,
  onClaim,
  onRefund,
  onLaunch
}: {
  list: ClaimListView;
  state: ClaimState;
  admin: boolean;
  disabled: boolean;
  onClaim: (entry: Entry) => void;
  onRefund: () => void;
  onLaunch: () => void;
}) {
  const { daoConfig: config } = useDaoContext();
  const phase = listPhase(list);
  const entry = list.claimList.status === 'verified' ? list.claimList.entry : null;
  const next = nextClaimCount(list);
  const escrowed = BigInt(list.escrowed ?? 0);
  const drive = list.assurance;
  return (
    <section className={styles.panel} aria-label={listName(list)}>
      <div className={styles.row}>
        <h2>{listName(list)}</h2>
        <Badge tone={phase === 'open' ? 'live' : phase === 'failed' ? 'danger' : 'neutral'}>
          {phase === 'open' ? 'Open' : phase === 'expired' ? 'Closed' : phase === 'full' ? 'All claimed' : 'Failed'}
        </Badge>
      </div>
      <p>
        {claimPriceLabel(config.name, list)} · {list.minted.toLocaleString()} of {list.total.toLocaleString()} tokens
        claimed by {list.claimers.toLocaleString()} {list.claimers === 1 ? 'person' : 'people'} · closes{' '}
        {formatClaimDate(list.expiresAt)}
      </p>
      {drive ? (
        <>
          <ProgressBar value={list.claimers} max={drive.thresholdClaimers} label="People who have claimed" />
          <p>
            {drive.state === 'failed'
              ? 'The drive ended before the community launched. Everyone who paid can take their payment back.'
              : drive.state === 'met'
                ? state.live
                  ? 'Enough people claimed and the community launched.'
                  : 'Enough people have claimed. Anyone can launch the community now.'
                : `${list.claimers.toLocaleString()} of ${drive.thresholdClaimers.toLocaleString()} people needed by ${formatClaimDate(drive.deadline)}. Payments are held until launch.`}
          </p>
          {drive.state === 'met' && !state.live ? (
            <div>
              <Button disabled={!state.authenticated || disabled} onClick={onLaunch}>
                Launch the community
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {list.claimList.status === 'unavailable' ? (
        <Callout
          variant="warning"
          title="Claim list unavailable"
          description={`${list.claimList.reason}${admin ? '' : ' You can still claim with a proof file from the organizer.'}`}
        />
      ) : list.claimList.status === 'verified' ? (
        <p className={styles.muted}>
          {list.claimList.recipients.toLocaleString()} people can claim {list.claimList.tokenTotal} tokens.
        </p>
      ) : null}
      {!admin && state.authenticated ? (
        entry ? (
          <>
            <p>
              {entry.amount} tokens for you · {list.claimed ?? 0} claimed
              {remainingAllocation(list) === 0n ? ' · all claimed' : ''}
            </p>
            {phase === 'open' && next > 0 ? (
              <div>
                <Button disabled={disabled} onClick={() => onClaim(entry)}>
                  Claim {next} {next === 1 ? 'token' : 'tokens'}
                </Button>
              </div>
            ) : null}
          </>
        ) : list.claimList.status === 'verified' ? (
          <p>You&apos;re not on this list.</p>
        ) : null
      ) : null}
      {!admin && phase === 'failed' && escrowed > 0n ? (
        <div>
          <Button variant="secondary" disabled={disabled} onClick={onRefund}>
            Take back {claimAmountLabel(config.name, list.asset, escrowed)}
          </Button>
        </div>
      ) : null}
      <Disclosure title="List details">
        <p className={styles.address}>Root: {list.root}</p>
        <p className={styles.address}>Published list: {list.treeUri}</p>
        <Address value={list.asset} label="Payment asset" />
      </Disclosure>
    </section>
  );
}
