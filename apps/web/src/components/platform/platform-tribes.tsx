'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Callout, Chip, Crest, ListRow, Section, SegmentedControl, Skeleton } from '@/components/ui';
import { CLASS_LABELS } from '@/lib/chain-reads/renewal';
import { daoAdminRoute, daoRouteId } from '@/lib/dao-routes';
import { needsRenewal, sortTribeRows, type TribeRow, type usePlatformTribes } from '@/lib/platform/tribes';
import type { TtlStatus } from '@/lib/ttl-expiry';

import { whenLedger } from './format';

const rows = css({ display: 'grid' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const controls = css({ display: 'flex', alignItems: 'center', gap: '3', flexWrap: 'wrap' });
// Sized like a real row, so rows fill in without shifting the page.
const rowSkeleton = css({ height: '14', borderRadius: 'control' });

export const TRIBE_STATUS: Record<TtlStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  soon: { label: 'Renew soon', tone: 'warning' },
  critical: { label: 'Expiring soon', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' }
};

function Row({ row, onRetry }: { row: TribeRow; onRetry: () => void }) {
  const { tribe } = row;
  const media = <Crest name={tribe.name} seed={tribe.daoId} size="sm" />;
  const title = tribe.status === 'pending' ? `${tribe.name} · in setup` : tribe.name;
  if (row.state === 'loading') {
    return (
      <ListRow
        media={media}
        title={title}
        meta="Checking storage…"
        trailing={<Skeleton className={css({ width: '20', height: '6', borderRadius: 'full' })} />}
      />
    );
  }
  if (row.state === 'error') {
    return (
      <ListRow
        media={media}
        title={title}
        meta={`Couldn't read its storage: ${row.error}`}
        wrap
        trailing={
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }
  const { health } = row;
  const meta = health.bootstrap
    ? 'Its contracts were archived. Restore them from its Renewal tab.'
    : health.earliestLiveUntil !== null && health.earliestClass
      ? `${CLASS_LABELS[health.earliestClass]} first expires about ${whenLedger(health.earliestLiveUntil, health.latestLedger)}${health.missing ? ` · ${health.missing} archived` : ''}`
      : 'Nothing to date';
  return (
    <ListRow
      media={media}
      title={title}
      meta={meta}
      href={daoAdminRoute(daoRouteId(tribe), '/renewal')}
      trailing={<Chip tone={TRIBE_STATUS[health.status].tone}>{TRIBE_STATUS[health.status].label}</Chip>}
    />
  );
}

/** Every tribe's storage, worst first, each linking to its own Renewal tab. */
export function PlatformTribes({ tribes }: { tribes: ReturnType<typeof usePlatformTribes> }) {
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const sorted = tribes.rows ? sortTribeRows(tribes.rows) : null;
  const shown = sorted?.filter((row) => filter === 'all' || needsRenewal(row));
  const busy = tribes.rows !== null && tribes.checked < tribes.total;

  return (
    <Section
      id="tribes"
      title="Tribes"
      description="Each tribe renews its own storage from Manage → Renewal; anyone can pay for it. Worst first."
      action={
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void tribes.refresh()}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      <div className={controls}>
        <SegmentedControl
          label="Show"
          id="platform-tribes-filter"
          value={filter}
          onValueChange={(value) => setFilter(value as 'all' | 'attention')}
          options={[
            { value: 'all', label: 'All' },
            { value: 'attention', label: 'Needs renewal' }
          ]}
        />
        <p className={muted} aria-live="polite">
          {tribes.rows === null
            ? 'Loading tribes…'
            : busy
              ? `Checked ${tribes.checked} of ${tribes.total}`
              : `${tribes.total} ${tribes.total === 1 ? 'tribe' : 'tribes'}`}
        </p>
      </div>
      {tribes.listError ? (
        <Callout variant="error" title="The tribe list didn't load" description={tribes.listError} />
      ) : null}
      {shown === null || shown === undefined ? (
        <div className={rows}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={rowSkeleton} />
          ))}
        </div>
      ) : shown.length ? (
        <div className={rows}>
          {shown.map((row) => (
            <Row key={row.tribe.daoId} row={row} onRetry={() => tribes.retry(row.tribe)} />
          ))}
        </div>
      ) : (
        <p className={muted}>{filter === 'attention' ? 'No tribe needs renewal.' : 'No tribes yet.'}</p>
      )}
    </Section>
  );
}
