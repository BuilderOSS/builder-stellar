'use client';

import { css } from 'styled-system/css';

import { ButtonLink, Callout, Chip, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { estimateDate } from '@/lib/chain-reads/renewal';
import { daoAdminRoute } from '@/lib/dao-routes';
import { type PlatformContractState, usePlatformUpgrades } from '@/lib/platform-upgrades';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const rows = css({ display: 'grid' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

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
 * Manage → Platform contracts (docs/STORAGE_DIET.md D39): what every community
 * depends on and whether an upgrade of it is pending, with the date it can
 * apply. A community that distrusts a pending Minter upgrade revokes the
 * Minter's mint authority by proposal; the notice is its window.
 */
export function PlatformUpgrades({ enabled }: { enabled: boolean }) {
  const { routeId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const report = usePlatformUpgrades(config, address, enabled);
  if (!enabled || !report.data) return null;
  const data = report.data;
  const minterPending = data.minter?.pending ?? null;
  // Quiet unless something is happening, or the check itself is incomplete.
  if (!data.manager?.pending && !minterPending && data.minterAuthority !== false && !data.errors.length) return null;

  return (
    <Section
      title="Platform contracts"
      description="Shared by every community. Builder can only upgrade them after a notice. A community that does not trust a pending Minter upgrade can revoke the Minter's mint authority by proposal before it applies."
    >
      <div className={rows}>
        {data.manager ? <Row state={data.manager} latestLedger={data.latestLedger} /> : null}
        {data.minter ? <Row state={data.minter} latestLedger={data.latestLedger} /> : null}
      </div>
      {data.errors.length ? (
        <Callout
          variant="warning"
          title="This check is incomplete"
          description={`Some of it could not be read: ${data.errors.join('; ')}. A pending upgrade may not be shown.`}
        />
      ) : null}
      {data.minterAuthority === false ? (
        <Callout
          variant="warning"
          title="The shared Minter has no mint authority for this community"
          description="Claims and batch mints through it fail until a proposal re-grants it."
        >
          <div>
            <ButtonLink href={daoAdminRoute(routeId, '/token')} variant="secondary" size="sm">
              Mint authorities
            </ButtonLink>
          </div>
        </Callout>
      ) : minterPending ? (
        <p className={muted}>
          To opt out of this Minter upgrade, propose removing the shared Minter from the mint authorities before it
          applies. A proposal takes this community&apos;s full voting and queue cycle, so start early.
        </p>
      ) : null}
    </Section>
  );
}

/**
 * A member-visible heads-up on the community home page: a Minter upgrade is
 * pending and the shared Minter still mints for this community. Members are
 * the ones who vote on removing it, so they see it, not only Manage.
 */
export function PlatformUpgradeNotice({ enabled }: { enabled: boolean }) {
  const { routeId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const report = usePlatformUpgrades(config, address, enabled);
  const pending = report.data?.minter?.pending ?? null;
  if (!enabled || !report.data || !pending || report.data.minterAuthority === false) return null;
  return (
    <Callout
      variant="info"
      title="A shared Minter upgrade is pending"
      description={`Builder will upgrade the shared Minter to ${pending.version ?? pending.toHash.slice(0, 8)} from about ${when(pending.earliestLedger, report.data.latestLedger)}. To opt out, members can propose removing it from the mint authorities before then.`}
    >
      <div>
        <ButtonLink href={daoAdminRoute(routeId, '')} variant="secondary" size="sm">
          Platform contracts
        </ButtonLink>
      </div>
    </Callout>
  );
}
