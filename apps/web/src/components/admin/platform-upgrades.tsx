'use client';

import { css } from 'styled-system/css';

import { ButtonLink, Callout, Chip, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { estimateDate } from '@/lib/chain-reads/renewal';
import { daoAdminRoute } from '@/lib/dao-routes';
import { memberNotice, type PlatformContractState, usePlatformUpgrades } from '@/lib/platform-upgrades';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const rows = css({ display: 'grid' });

const LABELS = { manager: 'Tribes Builder (registry and factory)' };

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
        pending?.revoked
          ? `The announced upgrade ${pending.version ?? pending.toHash.slice(0, 8)} was withdrawn and cannot apply`
          : pending
            ? `Upgrade to ${pending.version ?? pending.toHash.slice(0, 8)} approved · can apply from about ${when(pending.earliestLedger, latestLedger)} (${days}-day notice)${state.contract === 'manager' ? ' · new Tribes Builder code also controls the shared Minter' : ''}`
            : state.running
              ? `Running ${state.running.slice(0, 8)}… · upgrades need ${days} days' notice`
              : 'Could not be read'
      }
      trailing={
        pending?.revoked ? (
          <Chip tone="danger">Withdrawn</Chip>
        ) : pending ? (
          <Chip tone="warning">Upgrade pending</Chip>
        ) : (
          <Chip tone="success">No change pending</Chip>
        )
      }
    />
  );
}

/**
 * Manage → Platform contracts (docs/STORAGE_DIET.md D39): the Manager every
 * community depends on and whether an upgrade of it is pending, with the date
 * it can apply.
 */
export function PlatformUpgrades({ enabled }: { enabled: boolean }) {
  const { daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const report = usePlatformUpgrades(config, address, enabled);
  if (!enabled || !report.data) return null;
  const data = report.data;
  // Quiet unless something is happening, or the check itself is incomplete.
  if (!data.manager?.pending && !data.errors.length) return null;

  return (
    <Section
      title="Platform contracts"
      description="Shared by every tribe. Tribes Builder can only upgrade them after a notice. The contracts this tribe runs, its claims module included, change only by its own vote."
    >
      <div className={rows}>{data.manager ? <Row state={data.manager} latestLedger={data.latestLedger} /> : null}</div>
      {data.errors.length ? (
        <Callout
          variant="warning"
          title="This check is incomplete"
          description={`Some of it could not be read: ${data.errors.join('; ')}. A pending upgrade may not be shown.`}
        />
      ) : null}
    </Section>
  );
}

/**
 * A member-visible heads-up on the community home page: an upgrade of Builder's
 * Manager (the registry and factory every community relies on) is pending.
 */
export function PlatformUpgradeNotice({ enabled }: { enabled: boolean }) {
  const { routeId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const report = usePlatformUpgrades(config, address, enabled);
  if (!enabled || !report.data) return null;
  const notice = memberNotice(report.data);
  if (!notice) return null;
  if (notice.kind === 'unchecked')
    return (
      <Callout
        variant="warning"
        title="Couldn't check for platform upgrades"
        description="Some chain reads failed, so a pending upgrade of Tribes Builder's shared contracts may not be shown. Try again in a moment."
      />
    );
  return (
    <Callout
      variant="info"
      title="A platform upgrade is pending"
      description={`Tribes Builder will upgrade its registry to ${notice.version ?? notice.toHash.slice(0, 8)} from about ${when(notice.earliestLedger, report.data.latestLedger)}. It approves the upgrades this tribe can vote on; it cannot change this tribe's contracts.`}
    >
      <div>
        <ButtonLink href={daoAdminRoute(routeId, '')} variant="secondary" size="sm">
          Platform contracts
        </ButtonLink>
      </div>
    </Callout>
  );
}
