'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { chosenDays, RenewalDuration } from '@/components/admin/renewal-duration';
import { ActionBar, Button, Callout, Chip, Disclosure, ListRow, Section, Skeleton } from '@/components/ui';
import { type CodeStatus, LEDGERS_PER_DAY } from '@/lib/chain-reads/renewal';
import type { PlatformConfig } from '@/lib/platform/config';
import {
  DEFAULT_PLATFORM_RENEWAL_DAYS,
  MIN_PLATFORM_RENEWAL_DAYS,
  PLATFORM_CLASS_HINTS,
  PLATFORM_CLASS_LABELS,
  type PlatformQuote,
  quotePlatformRenewal,
  summarizePlatform,
  type usePlatformStorage
} from '@/lib/platform/storage';
import { submitRenewal } from '@/lib/renewal-queries';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';

import { whenLedger, xlm } from './format';

const stack = css({ display: 'grid', gap: '5' });
const rows = css({ display: 'grid' });
const muted = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const quoteBox = css({ display: 'grid', gap: '2', textStyle: 'body' });
const actions = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });
const mono = css({ textStyle: 'mono', fontSize: '0.8125rem' });

const PRESETS = ['30', '90', String(DEFAULT_PLATFORM_RENEWAL_DAYS)];

export const PLATFORM_STATUS: Record<
  Exclude<CodeStatus, 'unknown'>,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  healthy: { label: 'Healthy', tone: 'success' },
  soon: { label: 'Renew soon', tone: 'warning' },
  critical: { label: 'Renew now', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' }
};

/**
 * The platform's own storage: shared code, the registry records and the Manager. The admin gets a
 * price for the chosen period and renews it in one or a few transactions; others see the status.
 */
export function PlatformStorage({
  config,
  storage,
  admin,
  networkReady
}: {
  config: PlatformConfig;
  storage: ReturnType<typeof usePlatformStorage>;
  /** The signed-in platform admin's address; null hides every control. */
  admin: string | null;
  networkReady: boolean;
}) {
  const tx = useTransactionFeedback(config.name);
  const [preset, setPreset] = useState(String(DEFAULT_PLATFORM_RENEWAL_DAYS));
  const [custom, setCustom] = useState('');
  const [quote, setQuote] = useState<PlatformQuote | null>(null);
  const [busy, setBusy] = useState<'quote' | 'renew' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const data = storage.data;
  const maxDays = data ? Math.floor((data.maxEntryTtl - 1) / LEDGERS_PER_DAY) : DEFAULT_PLATFORM_RENEWAL_DAYS;
  const days = chosenDays(preset, custom);
  const validDays = Number.isInteger(days) && days >= MIN_PLATFORM_RENEWAL_DAYS && days <= maxDays;

  async function getQuote() {
    if (!data || !admin || !validDays) return;
    setBusy('quote');
    setError('');
    setQuote(null);
    try {
      setQuote(await quotePlatformRenewal(config, data, days, admin));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The renewal could not be priced.');
    } finally {
      setBusy(null);
    }
  }

  async function renew() {
    if (!quote || !admin) return;
    setBusy('renew');
    setError('');
    tx.start(`Renew platform storage for ${quote.days} days`);
    try {
      await submitRenewal(
        config,
        quote,
        // The admin saw this price before choosing to renew; the fee guard allows up to it.
        async (xdr) =>
          (
            await signWithWallet(
              xdr,
              { address: admin, networkPassphrase: config.passphrase },
              { maxFeeStroops: quote.totalFee }
            )
          ).signedTxXdr,
        (done, total) => setProgress(total > 1 ? `${done} of ${total} done` : '')
      );
      tx.success(`Platform storage renewed for ${quote.days} days`, '');
      setQuote(null);
    } catch (failure) {
      tx.fail(failure, 'Renewal stopped');
      setError(failure instanceof Error ? failure.message : 'Renewal stopped.');
    } finally {
      setBusy(null);
      setProgress('');
      await storage.mutate();
    }
  }

  const renewButton = quote ? (
    <Button loading={busy === 'renew'} disabled={!networkReady || busy !== null} onClick={() => void renew()}>
      {`Renew for ${quote.days} days · ${xlm(quote.totalFee)}`}
    </Button>
  ) : null;

  return (
    <Section
      id="storage"
      title="Shared storage"
      description="Kept alive by Tribe Builder for every tribe. Tribes bump shared code only a few days on their own."
      action={
        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void storage.mutate()}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      {storage.isLoading || !data ? (
        storage.error ? (
          <Callout
            variant="error"
            title="Platform storage didn't load"
            description={storage.error instanceof Error ? storage.error.message : 'Try again in a moment.'}
          />
        ) : (
          <Skeleton className={css({ height: '48', borderRadius: 'card' })} />
        )
      ) : (
        <div className={stack}>
          <div className={rows}>
            {summarizePlatform(data.inventory).map((summary) => {
              const status = summary.status === 'unknown' ? 'expired' : summary.status;
              return (
                <ListRow
                  key={summary.cls}
                  title={PLATFORM_CLASS_LABELS[summary.cls]}
                  wrap
                  meta={`${PLATFORM_CLASS_HINTS[summary.cls]} · ${summary.keys} ${summary.keys === 1 ? 'item' : 'items'}${
                    summary.earliestLiveUntil !== null
                      ? ` · first expires about ${whenLedger(summary.earliestLiveUntil, data.inventory.latestLedger)}`
                      : ''
                  }${summary.missing.length ? ` · ${summary.missing.length} archived, restored on renewal` : ''}`}
                  trailing={<Chip tone={PLATFORM_STATUS[status].tone}>{PLATFORM_STATUS[status].label}</Chip>}
                />
              );
            })}
          </div>
          {data.inventory.missing.length ? (
            <Disclosure title={`Archived (${data.inventory.missing.length})`}>
              <ul className={css({ m: '0', pl: '5', display: 'grid', gap: '1' })}>
                {data.inventory.missing.map((key) => (
                  <li key={key.key.toXDR('base64')} className={mono}>
                    {key.label}
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}

          {admin ? (
            <>
              <RenewalDuration
                id="platform-renewal-days"
                presets={PRESETS}
                preset={preset}
                custom={custom}
                minDays={MIN_PLATFORM_RENEWAL_DAYS}
                maxDays={maxDays}
                onChange={(next) => {
                  setPreset(next.preset);
                  setCustom(next.custom);
                  setQuote(null);
                }}
              />
              {quote ? (
                <div className={quoteBox} aria-live="polite">
                  <p className={css({ m: '0', fontWeight: '600' })}>
                    {quote.transactions.length === 1
                      ? `One transaction, about ${xlm(quote.totalFee)} in network fees.`
                      : `${quote.transactions.length} transactions, about ${xlm(quote.totalFee)} in network fees.`}
                  </p>
                  {quote.yearlyFee !== null ? (
                    <p className={muted}>
                      At this rate, keeping it all alive costs about {xlm(quote.yearlyFee)} a year.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <Callout variant="error" title="Renewal needs attention" description={error} role="alert" />
              ) : null}
              <div className={actions}>
                {quote ? (
                  <span className={css({ display: { base: 'none', md: 'contents' } })}>{renewButton}</span>
                ) : (
                  <Button
                    variant="secondary"
                    loading={busy === 'quote'}
                    disabled={!validDays || busy !== null}
                    onClick={() => void getQuote()}
                  >
                    Get a price
                  </Button>
                )}
                {progress ? <span className={muted}>{progress}</span> : null}
              </div>
              {/* Under md the page's one primary action sits in the sticky bar (DESIGN.md density rule 2). */}
              {renewButton ? <ActionBar mobileOnly>{renewButton}</ActionBar> : null}
            </>
          ) : null}
        </div>
      )}
    </Section>
  );
}
