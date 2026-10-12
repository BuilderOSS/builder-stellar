'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, ButtonLink, Callout, Chip, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { estimateDate } from '@/lib/chain-reads/renewal';
import { daoAdminRoute } from '@/lib/dao-routes';
import { pausePlatformMinter, type PlatformContractState, usePlatformUpgrades } from '@/lib/platform-upgrades';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const rows = css({ display: 'grid' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const actions = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });

const LABELS = { manager: 'Builder (registry and factory)', minter: 'Shared Minter (claims and batch mints)' };

function when(ledger: number, latestLedger: number) {
  return estimateDate(ledger, latestLedger, Date.now()).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function Row({ state, latestLedger }: { state: PlatformContractState; latestLedger: number }) {
  const pending = state.pending;
  const days = (state.notice / 17_280).toFixed(state.notice >= 17_280 ? 0 : 2);
  return (
    <ListRow
      title={LABELS[state.contract]}
      meta={
        pending
          ? `Upgrade to ${pending.version ?? pending.toHash.slice(0, 8)} approved · can apply from about ${when(pending.earliestLedger, latestLedger)} (${days}-day notice)`
          : state.running
            ? `Running ${state.running.slice(0, 8)}… · upgrades need ${days} days' notice`
            : 'Could not be read'
      }
      trailing={pending ? <Chip tone="warning">Upgrade pending</Chip> : <Chip tone="success">No change pending</Chip>}
    />
  );
}

/**
 * Manage → Platform contracts (docs/STORAGE_DIET.md D39, D41): what every
 * community depends on, whether an upgrade of it is pending, and the minter
 * guardian's one-signature exit from a Minter upgrade the community distrusts.
 */
export function PlatformUpgrades({ enabled }: { enabled: boolean }) {
  const { routeId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const report = usePlatformUpgrades(config, address, enabled);
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  if (!enabled || !report.data) return null;
  const data = report.data;
  const isGuardian = Boolean(address && data.guardian === address);
  const minterPending = data.minter?.pending ?? null;
  // Quiet unless something is happening or the viewer can act.
  if (!data.manager.pending && !minterPending && !isGuardian && data.minterAuthority !== false) return null;

  async function pause() {
    if (!address) return;
    setBusy(true);
    tx.start('Pause the shared Minter');
    try {
      await pausePlatformMinter(config, address);
      tx.success('Shared Minter paused for this community', '');
      await report.mutate();
    } catch (error) {
      tx.fail(error, 'The Minter was not paused');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Platform contracts"
      description="Shared by every community. Builder can only upgrade them after a notice; during it, this community's minter guardian can pause the shared Minter with one signature."
    >
      <div className={rows}>
        <Row state={data.manager} latestLedger={data.latestLedger} />
        {data.minter ? <Row state={data.minter} latestLedger={data.latestLedger} /> : null}
      </div>
      {data.minterAuthority === false ? (
        <Callout
          variant="warning"
          title="The shared Minter is paused for this community"
          description="Claims and batch mints through it fail until a proposal re-grants its mint authority."
        >
          <div>
            <ButtonLink href={daoAdminRoute(routeId, '/token')} variant="secondary" size="sm">
              Mint authorities
            </ButtonLink>
          </div>
        </Callout>
      ) : null}
      <p className={muted}>
        Minter guardian: {data.guardian ? (isGuardian ? 'you' : data.guardian) : 'none (set one by proposal)'}
      </p>
      {isGuardian && data.minterAuthority ? (
        <div className={actions}>
          <Button
            variant={minterPending ? 'primary' : 'secondary'}
            loading={busy}
            disabled={busy}
            onClick={() => void pause()}
          >
            Pause the shared Minter
          </Button>
          <span className={muted}>
            {minterPending
              ? 'Stops the pending upgrade from minting for this community. Reversible by proposal.'
              : 'Only if you distrust an upcoming upgrade. Reversible by proposal.'}
          </span>
        </div>
      ) : null}
    </Section>
  );
}
