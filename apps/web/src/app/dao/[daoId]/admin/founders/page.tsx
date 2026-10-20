'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { Plus, RefreshCw, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';

import { type FounderMintRow, founderMintValues } from '@/components/admin/founder-mint-values';
import { InitialAllocations } from '@/components/admin/initial-allocations';
import { PageSection } from '@/components/page-section';
import {
  Address,
  Button,
  ButtonLink,
  Callout,
  Card,
  Checkbox,
  Chip,
  Heading,
  IconButton,
  Input,
  shortenId,
  Text
} from '@/components/ui';
import { CsvFileButton, SampleCsvLink } from '@/components/wallet-csv-import';
import { useDaoContext } from '@/contexts/dao-context';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { batchMintFits, MAX_BATCH_MINT, MAX_BATCH_RECIPIENTS } from '@/lib/batch-mint-budget';
import { daoAdminRoute } from '@/lib/dao-routes';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { confirmCreationTransaction, DefinitiveTransactionFailure } from '@/lib/use-dao-deployment';
import { parseWalletCsv, type WalletProblem } from '@/lib/wallet-csv';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const EMPTY_ROW: FounderMintRow = { recipient: '', amount: '1' };

const table = css({ display: 'grid', gap: '2' });
const cardHead = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' });
const row = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 5.5rem 2.5rem',
  gap: '2',
  alignItems: 'start'
});
const columnLabel = css({ textStyle: 'caption', color: 'ink.muted' });
const amountInput = css({ fontVariantNumeric: 'tabular-nums' });
const rowError = css({ gridColumn: '1 / -1', textStyle: 'caption', color: 'danger', m: '0', mt: '-1' });
const footer = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  pt: '4',
  borderTopWidth: '1px',
  borderColor: 'rule'
});
const total = css({ textStyle: 'label', color: 'ink', m: '0', fontVariantNumeric: 'tabular-nums' });
const actions = css({ display: 'flex', flexWrap: 'wrap', gap: '2', justifyContent: 'flex-end' });
const reviewList = css({
  display: 'grid',
  listStyle: 'none',
  m: '0',
  p: '0',
  '& li': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '3',
    py: '2.5',
    borderBottomWidth: '1px',
    borderColor: 'rule',
    textStyle: 'body',
    fontVariantNumeric: 'tabular-nums'
  }
});
const mono = css({ textStyle: 'mono', fontSize: '0.875rem' });
const tools = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1' });
const skipped = css({ m: '0', mt: '2', pl: '4', display: 'grid', gap: '1', textStyle: 'caption', color: 'ink' });
const SHOWN_SKIPPED = 6;

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function readSaved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** What's wrong with one row, if anything, worded for the person typing it. */
function rowIssue(rows: FounderMintRow[], index: number) {
  const recipient = rows[index]!.recipient.trim();
  const amount = rows[index]!.amount;
  if (recipient && !StrKey.isValidEd25519PublicKey(recipient)) return 'This isn’t a Stellar wallet address (G…).';
  if (recipient && rows.findIndex((other) => other.recipient.trim() === recipient) !== index)
    return 'This wallet is already listed above. Add its tokens to that row.';
  if (amount && (!/^\d+$/.test(amount) || Number(amount) < 1 || Number(amount) > MAX_BATCH_MINT))
    return `Use a whole number from 1 to ${MAX_BATCH_MINT}.`;
  return null;
}

export default function FoundersAdminPage() {
  const { daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  const tx = useTransactionFeedback(config.name);
  const [rows, setRows] = useState<FounderMintRow[]>([EMPTY_ROW]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState('');
  const [imported, setImported] = useState<{ name: string; count: number; problems: WalletProblem[] } | null>(null);
  // The Metadata hook seeds traits at mint time and seeds nothing without
  // artwork; the contract cannot block such a mint, so require an explicit ack.
  const [ackNoArtwork, setAckNoArtwork] = useState(false);
  const noArtwork = Boolean(artwork.data && !artwork.data.properties.length);
  const allowed = Boolean(
    token.data && !token.data.live && token.data.admin === session.address && session.authStatus === 'authenticated'
  );
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const receiptKey = `founder-mint:${config.name}:${config.tokenContractId}:${session.address}`;
  const editable = allowed && !busy && !review && !receipt;
  const issues = rows.map((_, index) => rowIssue(rows, index));
  const complete = rows.every((item) => item.recipient.trim() && item.amount) && issues.every((issue) => !issue);
  const tokens = rows.reduce((sum, item) => sum + (/^\d+$/.test(item.amount) ? Number(item.amount) : 0), 0);
  const fits = tokens > 0 && batchMintFits(tokens, rows.length);

  // A signed mint whose outcome this browser never saw: offer to check it before anything else.
  // Read on every render, so it follows this tab's own writes; other tabs' come as storage events.
  const savedHash = useSyncExternalStore(
    subscribeStorage,
    () => readSaved(receiptKey),
    () => null
  );

  /** Fill the table from a CSV; rows this page can't use show here, the rest get the per-row checks. */
  function importCsv(text: string, name: string) {
    const parsed = parseWalletCsv(text);
    const loaded = parsed.rows.map((item) => ({ recipient: item.address, amount: item.amount }));
    setRows(loaded.length ? loaded : [EMPTY_ROW]);
    setImported({
      name,
      count: loaded.length,
      problems: loaded.length || parsed.problems.length ? parsed.problems : [{ line: 0, message: 'No wallets found.' }]
    });
    setMessage('');
  }

  function updateRow(index: number, change: Partial<FounderMintRow>) {
    setRows((current) => current.map((item, id) => (id === index ? { ...item, ...change } : item)));
    setMessage('');
  }

  async function mint(recoverOnly = false) {
    if (!allowed || !networkReady || busy || !session.address) return;
    setBusy(true);
    setMessage('');
    try {
      if (!navigator.locks)
        throw new Error('Use a browser with Web Locks support to keep founder minting safe across tabs.');
      await navigator.locks.request(`dao-${receiptKey}`, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('A founder mint is already being processed in another tab.');
        // A saved signed hash prevents blind re-minting after a timeout/reload.
        const saved = localStorage.getItem(receiptKey);
        if (saved) {
          await confirmCreationTransaction(saved, config.rpcUrl);
          setReceipt(saved);
          setMessage('');
          await token.mutate();
          return;
        }
        if (recoverOnly) {
          setMessage('There is no unchecked founder mint from this browser.');
          return;
        }
        if (!review) throw new Error('Review the founder tokens before signing.');
        if (noArtwork && !ackNoArtwork)
          throw new Error('Add the artwork first, or confirm that these tokens will have no traits.');
        const values = founderMintValues(rows);
        const current = await token.mutate();
        if (!current || current.live || current.admin !== session.address)
          throw new Error('Your setup admin rights changed. Refresh before minting.');
        const client = new TokenClient({
          ...adminReadOptions(config, config.tokenContractId, session.address),
          ...restoreArchivedState,
          signTransaction: async (xdr, opts) => {
            const checkWallet = () => {
              const wallet = useAuthSessionStore.getState();
              if (
                wallet.address !== session.address ||
                wallet.authStatus !== 'authenticated' ||
                wallet.walletNetworkIssue ||
                (wallet.walletNetworkPassphrase && wallet.walletNetworkPassphrase !== config.passphrase)
              )
                throw new Error('Wallet changed. Reconnect the setup admin on the DAO network.');
            };
            checkWallet();
            const signed = await signWithWallet(xdr, {
              ...opts,
              address: session.address!,
              networkPassphrase: config.passphrase
            });
            checkWallet();
            const hash = Array.from(TransactionBuilder.fromXDR(signed.signedTxXdr, config.passphrase).hash(), (byte) =>
              byte.toString(16).padStart(2, '0')
            ).join('');
            localStorage.setItem(receiptKey, hash);
            if (localStorage.getItem(receiptKey) !== hash)
              throw new Error('Could not save the mint recovery hash. Transaction not submitted.');
            return signed;
          }
        });
        tx.start('Mint founder tokens');
        const assembled = await client.batch_mint({
          minter: session.address,
          recipients: values.recipients,
          amounts: values.amounts
        });
        const sent = await assembled.signAndSend();
        const expectedHash = localStorage.getItem(receiptKey);
        const hash = sent.sendTransactionResponse?.hash || expectedHash;
        if (!hash || hash !== expectedHash)
          throw new Error(
            'Mint transaction hash could not be verified. Check the saved transaction before trying again.'
          );
        tx.submitted('Founder tokens submitted', hash);
        await confirmCreationTransaction(hash, config.rpcUrl);
        tx.success('Founder tokens minted', hash);
        setReceipt(hash);
        setReview(false);
        await token.mutate();
      });
    } catch (error) {
      if (error instanceof DefinitiveTransactionFailure) localStorage.removeItem(receiptKey);
      tx.fail(error, 'Founder mint needs attention', 'token');
      setMessage(error instanceof Error ? error.message : 'Mint failed');
    } finally {
      setBusy(false);
    }
  }

  function startReview() {
    try {
      founderMintValues(rows);
      setReview(true);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  function startOver() {
    localStorage.removeItem(receiptKey);
    setReceipt('');
    setRows([EMPTY_ROW]);
    setReview(false);
    setAckNoArtwork(false);
    setImported(null);
  }

  return (
    <PageSection title="Founder tokens">
      <Stack gap="4">
        {token.error ? (
          <Callout variant="error" title="The token didn't load" description={token.error.message} />
        ) : null}

        {!token.data ? (
          token.isLoading ? (
            <Text role="status" color="ink.muted">
              Checking the token…
            </Text>
          ) : null
        ) : token.data.live ? (
          <>
            <div>
              <Chip tone="live">Launched</Chip>
            </div>
            <InitialAllocations />
            <div>
              <ButtonLink href={daoAdminRoute(routeId, '/token')} variant="secondary" size="sm">
                Mint tokens
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            {token.data && !allowed ? (
              <Callout
                variant="info"
                title="Connect the launch admin wallet"
                description="Only the launch admin can mint founder tokens, and only before launch. Connect it and sign in."
              />
            ) : null}
            {allowed && savedHash && !receipt ? (
              <Callout
                variant="warning"
                title="A founder mint from this browser hasn't been checked"
                description="It was signed but this page never saw it confirm. Check it before minting again, so no one gets tokens twice."
              >
                <div className={css({ mt: '3' })}>
                  <Button variant="secondary" size="sm" loading={busy} onClick={() => void mint(true)}>
                    Check the saved mint
                  </Button>
                </div>
              </Callout>
            ) : null}
            {noArtwork ? (
              <Callout
                variant="warning"
                title="Add your artwork first"
                description="Each token's traits are picked from the artwork when it's minted. Tokens minted now get none until someone seeds them later."
              >
                <div className={css({ mt: '3' })}>
                  <ButtonLink href={daoAdminRoute(routeId, '/artwork')} variant="secondary" size="sm">
                    Go to Artwork
                  </ButtonLink>
                </div>
              </Callout>
            ) : null}
            {receipt ? (
              <Callout variant="success" title="Founder tokens minted">
                <div className={css({ display: 'grid', gap: '3', mt: '2' })}>
                  <Address value={receipt} label="Transaction" />
                  <div>
                    <Button variant="secondary" size="sm" onClick={startOver}>
                      Mint for more founders
                    </Button>
                  </div>
                </div>
              </Callout>
            ) : null}

            <Card p="5">
              <Stack gap="4">
                <div className={cardHead}>
                  <div>
                    <Heading size="heading">{review ? 'Check before you sign' : 'Who gets founder tokens'}</Heading>
                    <Text color="ink.muted">
                      {review
                        ? 'Minting can’t be undone. These are ordinary voting tokens, the same as any other member’s.'
                        : `Voting supply now: ${token.data ? token.data.supply.toString() : '…'}. One transaction holds up to ${MAX_BATCH_MINT} tokens for one wallet, or ${MAX_BATCH_RECIPIENTS} wallets with one each.`}
                    </Text>
                  </div>
                  <IconButton
                    label="Refresh"
                    size="sm"
                    disabled={busy || token.isValidating}
                    onClick={() => void Promise.all([token.mutate(), artwork.mutate()])}
                  >
                    <RefreshCw aria-hidden="true" />
                  </IconButton>
                </div>

                {review ? (
                  <ul className={reviewList} aria-label="Founder tokens to mint">
                    {rows.map((item) => (
                      <li key={item.recipient}>
                        <span className={mono} title={item.recipient}>
                          {shortenId(item.recipient.trim())}
                        </span>
                        <span>
                          {item.amount} {item.amount === '1' ? 'token' : 'tokens'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={table}>
                    <div className={row} aria-hidden="true">
                      <span className={columnLabel}>Wallet address</span>
                      <span className={columnLabel}>Tokens</span>
                    </div>
                    {rows.map((item, index) => (
                      <div key={index} className={row}>
                        <Input
                          aria-label={`Founder ${index + 1} wallet address`}
                          aria-invalid={issues[index] ? true : undefined}
                          placeholder="G…"
                          autoComplete="off"
                          spellCheck={false}
                          className={mono}
                          value={item.recipient}
                          disabled={!editable}
                          onChange={(event) => updateRow(index, { recipient: event.target.value })}
                        />
                        <Input
                          aria-label={`Founder ${index + 1} tokens`}
                          inputMode="numeric"
                          className={amountInput}
                          value={item.amount}
                          disabled={!editable}
                          onChange={(event) => updateRow(index, { amount: event.target.value.trim() })}
                        />
                        <IconButton
                          label={`Remove founder ${index + 1}`}
                          disabled={!editable || rows.length === 1}
                          onClick={() => setRows((current) => current.filter((_, id) => id !== index))}
                        >
                          <X aria-hidden="true" />
                        </IconButton>
                        {issues[index] ? (
                          <p className={rowError} role="alert">
                            {issues[index]}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    <div className={tools}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!editable || rows.length >= MAX_BATCH_RECIPIENTS}
                        onClick={() => setRows((current) => [...current, EMPTY_ROW])}
                      >
                        <Plus aria-hidden="true" />
                        Add a founder
                      </Button>
                      <CsvFileButton
                        disabled={!editable}
                        onRead={importCsv}
                        onError={(error) =>
                          setImported({ name: '', count: 0, problems: [{ line: 0, message: error }] })
                        }
                      >
                        Import a CSV
                      </CsvFileButton>
                      <SampleCsvLink />
                    </div>
                  </div>
                )}

                {!review && imported?.problems.length ? (
                  <Callout
                    variant="error"
                    title={
                      imported.count
                        ? `Loaded ${imported.count} ${imported.count === 1 ? 'wallet' : 'wallets'}; ${imported.problems.length} ${imported.problems.length === 1 ? 'line was' : 'lines were'} skipped`
                        : `Couldn't load ${imported.name || 'that file'}`
                    }
                    description="Fix these in the file and import it again, or add them by hand."
                  >
                    <ul className={skipped}>
                      {imported.problems.slice(0, SHOWN_SKIPPED).map((problem, index) => (
                        <li key={`${problem.line}:${index}`}>
                          {problem.line ? `Line ${problem.line}: ` : ''}
                          {problem.message}
                        </li>
                      ))}
                      {imported.problems.length > SHOWN_SKIPPED ? (
                        <li>And {imported.problems.length - SHOWN_SKIPPED} more.</li>
                      ) : null}
                    </ul>
                  </Callout>
                ) : !review && imported?.count ? (
                  <Text color="ink.muted" textStyle="caption" role="status">
                    Loaded {imported.count} {imported.count === 1 ? 'wallet' : 'wallets'} from {imported.name}.
                  </Text>
                ) : null}

                {review && noArtwork ? (
                  <Checkbox
                    label="I understand these tokens will have no traits until someone seeds them."
                    checked={ackNoArtwork}
                    disabled={busy}
                    onCheckedChange={setAckNoArtwork}
                  />
                ) : null}

                <div className={footer}>
                  <p className={total}>
                    {tokens.toLocaleString()} {tokens === 1 ? 'token' : 'tokens'} to {rows.length}{' '}
                    {rows.length === 1 ? 'wallet' : 'wallets'}
                    {tokens > 0 && !fits ? (
                      <span className={css({ display: 'block', color: 'danger', fontWeight: '400' })}>
                        Too many for one transaction. Mint some now and the rest after.
                      </span>
                    ) : null}
                  </p>
                  {review ? (
                    <div className={actions}>
                      <Button variant="ghost" disabled={busy} onClick={() => setReview(false)}>
                        Edit
                      </Button>
                      <Button
                        loading={busy}
                        disabled={!allowed || !networkReady || (noArtwork && !ackNoArtwork)}
                        onClick={() => void mint()}
                      >
                        Sign and mint {tokens.toLocaleString()} {tokens === 1 ? 'token' : 'tokens'}
                      </Button>
                    </div>
                  ) : (
                    <Button disabled={!editable || !networkReady || !complete || !fits} onClick={startReview}>
                      Review
                    </Button>
                  )}
                </div>
                {message ? (
                  <div role="status">
                    <Callout variant="warning" title={message} />
                  </div>
                ) : null}
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </PageSection>
  );
}
