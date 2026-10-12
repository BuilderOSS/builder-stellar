'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import {
  Button,
  Callout,
  Chip,
  Disclosure,
  FieldLabel,
  Input,
  ListRow,
  SegmentedControl,
  Skeleton
} from '@/components/ui';
import { formatStroops } from '@/lib/auction-values';
import {
  CLASS_LABELS,
  estimateDate,
  LEDGERS_PER_DAY,
  type RenewalClass,
  summarizeInventory
} from '@/lib/chain-reads/renewal';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import {
  quoteRenewal,
  type RenewalQuote,
  type RenewalReport,
  submitRenewal,
  useDaoRenewal
} from '@/lib/renewal-queries';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { classifyRemainingLedgers, type TtlStatus } from '@/lib/ttl-expiry';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const stack = css({ display: 'grid', gap: '5' });
const rows = css({ display: 'grid' });
const controls = css({ display: 'grid', gap: '3', maxW: '32rem' });
const customRow = css({ display: 'flex', alignItems: 'center', gap: '2' });
const days = css({ maxW: '8rem' });
const quoteBox = css({ display: 'grid', gap: '2', textStyle: 'body' });
const muted = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const mono = css({ textStyle: 'mono', fontSize: '0.8125rem' });
const actions = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });

const PRESETS = ['30', '90', '180'];
const CLASS_HINTS: Record<RenewalClass, string> = {
  contracts: 'The community’s six contracts',
  artwork: 'Layer names, images and each token’s traits',
  tokens: 'Supply history and who may mint',
  proposals: 'Open proposals and quorum history',
  listings: 'Open market listings',
  slug: 'Your /dao link',
  claims: 'The current claim round'
};
const STATUS_TEXT: Record<TtlStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  soon: { label: 'Renew soon', tone: 'warning' },
  critical: { label: 'Renew now', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' }
};

function when(liveUntil: number, latestLedger: number) {
  return estimateDate(liveUntil, latestLedger, Date.now()).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function xlm(stroops: bigint) {
  return `${formatStroops(stroops)} XLM`;
}

function Classes({ report }: { report: RenewalReport }) {
  const { latestLedger } = report.inventory;
  return (
    <div className={rows}>
      {summarizeInventory(report.inventory).map((summary) => {
        const status =
          summary.missing > 0 || summary.earliestLiveUntil === null
            ? 'expired'
            : classifyRemainingLedgers(summary.earliestLiveUntil - latestLedger);
        return (
          <ListRow
            key={summary.cls}
            title={CLASS_LABELS[summary.cls]}
            meta={
              summary.earliestLiveUntil === null
                ? `${CLASS_HINTS[summary.cls]} · archived, restored on renewal`
                : `${CLASS_HINTS[summary.cls]} · ${summary.keys} ${summary.keys === 1 ? 'item' : 'items'} · first expires about ${when(summary.earliestLiveUntil, latestLedger)}${summary.missing ? ` · ${summary.missing} archived` : ''}`
            }
            trailing={<Chip tone={STATUS_TEXT[status].tone}>{STATUS_TEXT[status].label}</Chip>}
          />
        );
      })}
      <ListRow
        title="Shared contract code"
        meta={
          report.code.liveUntil === null
            ? 'Renewed by Builder for every community. Its expiry could not be read.'
            : `Renewed by Builder for every community · expires about ${when(report.code.liveUntil, latestLedger)}`
        }
        trailing={<Chip>Platform</Chip>}
      />
    </div>
  );
}

/**
 * Manage → Storage renewal (docs/STORAGE_DIET.md § 7). Everything the community
 * owns is listed from chain and renewed in one transaction from any wallet; the
 * price is simulated before anything is signed.
 */
export function RenewalPanel({ config }: { config: DaoNetworkConfig }) {
  const session = useAuthSessionStore();
  const report = useDaoRenewal(config);
  const tx = useTransactionFeedback(config.name);
  const [preset, setPreset] = useState('90');
  const [custom, setCustom] = useState('');
  const [quote, setQuote] = useState<RenewalQuote | null>(null);
  const [busy, setBusy] = useState<'quote' | 'renew' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const maxDays = report.data ? Math.floor((report.data.maxEntryTtl - 1) / LEDGERS_PER_DAY) : 180;
  const chosen = preset === 'custom' ? Number(custom) : Number(preset);
  const validDays = Number.isInteger(chosen) && chosen >= 1 && chosen <= maxDays;
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);

  async function getQuote() {
    if (!report.data || !address || !validDays) return;
    setBusy('quote');
    setError('');
    setQuote(null);
    try {
      setQuote(await quoteRenewal(config, report.data, chosen, address));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The renewal could not be priced.');
    } finally {
      setBusy(null);
    }
  }

  async function renew() {
    if (!quote || !address) return;
    setBusy('renew');
    setError('');
    tx.start(`Renew storage for ${quote.days} days`);
    try {
      await submitRenewal(
        config,
        quote,
        async (xdr) => (await signWithWallet(xdr, { address, networkPassphrase: config.passphrase })).signedTxXdr,
        (done, total) => setProgress(total > 1 ? `${done} of ${total} done` : '')
      );
      tx.success(`Storage renewed for ${quote.days} days`, '');
      setQuote(null);
    } catch (failure) {
      tx.fail(failure, 'Renewal stopped');
      setError(failure instanceof Error ? failure.message : 'Renewal stopped.');
    } finally {
      setBusy(null);
      setProgress('');
      await report.mutate();
    }
  }

  if (report.isLoading) return <Skeleton className={css({ height: '48', borderRadius: 'card' })} />;
  if (report.error || !report.data)
    return (
      <Callout
        variant="error"
        title="Storage status didn't load"
        description={report.error instanceof Error ? report.error.message : 'Try again in a moment.'}
      />
    );

  const { inventory } = report.data;
  return (
    <div className={stack}>
      <p className={muted}>
        Stellar keeps a community&apos;s data for a paid stretch of time. Renewing pays for more, for everything below
        at once. Anyone can renew; the wallet that signs pays the network fee.
      </p>
      {inventory.missing.length ? (
        <Callout
          variant="warning"
          title={`${inventory.missing.length} ${inventory.missing.length === 1 ? 'item was' : 'items were'} archived`}
          description="They are restored first, in the same renewal. Until then, the parts of the community that use them stop working."
        />
      ) : null}
      <Classes report={report.data} />

      <div className={controls}>
        <SegmentedControl
          label="Renew for"
          value={preset}
          onValueChange={(value) => {
            setPreset(value);
            setQuote(null);
          }}
          options={[
            ...PRESETS.map((value) => ({ value, label: `${value} days` })),
            { value: 'custom', label: 'Other' }
          ]}
        />
        {preset === 'custom' ? (
          <div className={customRow}>
            <FieldLabel htmlFor="renewal-days">Days</FieldLabel>
            <Input
              id="renewal-days"
              className={days}
              inputMode="numeric"
              value={custom}
              placeholder={String(maxDays)}
              aria-invalid={(custom !== '' && !validDays) || undefined}
              onChange={(event) => {
                setCustom(event.target.value.replace(/\D/g, ''));
                setQuote(null);
              }}
            />
            <span className={muted}>up to {maxDays}</span>
          </div>
        ) : null}
      </div>

      {!address ? <p className={muted}>Connect a wallet to see the price and renew.</p> : null}

      {quote ? (
        <div className={quoteBox} aria-live="polite">
          <p className={css({ m: '0', fontWeight: '600' })}>
            {quote.transactions.length === 1
              ? `One transaction, about ${xlm(quote.totalFee)} in network fees.`
              : `${quote.transactions.length} transactions, about ${xlm(quote.totalFee)} in network fees.`}
          </p>
          <Disclosure title="Price by part">
            <ul className={css({ m: '0', pl: '5', display: 'grid', gap: '1' })}>
              {quote.classFees.map((item) => (
                <li key={item.cls}>
                  {item.label}: <span className={mono}>{xlm(item.fee)}</span> on its own
                </li>
              ))}
            </ul>
            <p className={muted}>Renewing everything together costs less than the parts added up.</p>
          </Disclosure>
        </div>
      ) : null}

      {error ? <Callout variant="error" title="Renewal needs attention" description={error} role="alert" /> : null}

      <div className={actions}>
        {quote ? (
          <Button loading={busy === 'renew'} disabled={!networkReady || busy !== null} onClick={() => void renew()}>
            {`Renew for ${quote.days} days · ${xlm(quote.totalFee)}`}
          </Button>
        ) : (
          <Button
            variant="secondary"
            loading={busy === 'quote'}
            disabled={!address || !validDays || busy !== null}
            onClick={() => void getQuote()}
          >
            Get a price
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void report.mutate()}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
        {progress ? <span className={muted}>{progress}</span> : null}
      </div>
    </div>
  );
}
