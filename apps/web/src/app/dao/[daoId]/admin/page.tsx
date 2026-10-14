'use client';

import { css } from 'styled-system/css';

import { ContractUpdatesNotice } from '@/components/admin/contract-updates-notice';
import { PlatformUpgrades } from '@/components/admin/platform-upgrades';
import { PageSection } from '@/components/page-section';
import { ProposalDraftPanel } from '@/components/proposal/proposal-draft-panel';
import { Avatar, Chip, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { useAdminTokenState } from '@/lib/admin-surfaces';
import { daoAdminRoute } from '@/lib/dao-routes';
import { manageGroups } from '@/lib/manage-sections';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const accessCard = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '4',
  p: '5',
  borderRadius: 'card',
  bg: 'surface',
  boxShadow: 'raised'
});
const accessTitle = css({ textStyle: 'heading', m: '0' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '0.5' });
const chips = css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' });

type Access = 'direct' | 'vote' | 'read' | 'open';

function AccessChip({ access }: { access: Access }) {
  if (access === 'direct') return <Chip tone="yours">You can change this</Chip>;
  if (access === 'vote') return <Chip tone="live">Needs a vote</Chip>;
  if (access === 'read') return <Chip>Read only</Chip>;
  return null;
}

const access = (direct: boolean, vote: boolean): Access => (direct ? 'direct' : vote ? 'vote' : 'read');

export default function AdminPage() {
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const { data: tokenAdmin } = useContractAdmin(config, 'token', session.address || undefined);
  const { data: governorAdmin } = useContractAdmin(config, 'governor', session.address || undefined);
  const { data: auctionAdmin } = useContractAdmin(config, 'auction', session.address || undefined);

  const token = useAdminTokenState(config, session.address);
  const isAdmin = Boolean(session.address && token.data?.admin === session.address);
  // Only the Token admin mints directly; modules mint against their allowances.
  const hasMintAccess = Boolean(isAdmin);
  const hasGovernanceAccess = Boolean(session.address && governorAdmin === session.address);
  const canProposeAdminActions = treasuryIsAdmin(config, tokenAdmin) || treasuryIsAdmin(config, governorAdmin);
  // The Treasury mints as the Token admin; modules mint against their allowances.
  const canProposeMint = treasuryIsAdmin(config, tokenAdmin);
  const canProposeGovernance = treasuryIsAdmin(config, governorAdmin);
  const canProposeAuction = treasuryIsAdmin(config, auctionAdmin);
  const hasAnyAccess = Boolean(
    isAdmin ||
    hasMintAccess ||
    hasGovernanceAccess ||
    canProposeAdminActions ||
    canProposeMint ||
    canProposeGovernance ||
    canProposeAuction
  );

  // Who can change each section; anything not listed is open to read and act on.
  const accessFor: Partial<Record<string, Access>> = {
    profile: access(isAdmin, canProposeAdminActions),
    token: access(hasMintAccess, canProposeMint),
    governance: access(hasGovernanceAccess, canProposeGovernance),
    owner: access(isAdmin, canProposeAdminActions),
    auction: access(isAdmin, canProposeAuction)
  };
  const sections = manageGroups({
    auction: Boolean(config.auctionContractId),
    marketplace: Boolean(config.marketplaceContractId),
    claims: Boolean(config.claimsContractId)
  })
    .flatMap((group) => group.items)
    .filter((section) => section.key !== 'overview');

  return (
    <PageSection
      title="Manage"
      description={`Change how ${config.tokenName || 'this community'} works. ${
        config.status === 'pending'
          ? 'In Setup, the launch admin makes changes directly.'
          : 'After launch, most changes go up for a vote.'
      }`}
    >
      <ContractUpdatesNotice enabled={hasAnyAccess} />
      <PlatformUpgrades enabled={hasAnyAccess} />
      <section className={accessCard} aria-labelledby="access-title">
        <div className={css({ display: 'flex', alignItems: 'center', gap: '3', minW: '0' })}>
          {session.address ? <Avatar address={session.address} size="lg" yours={hasAnyAccess} /> : null}
          <div className={css({ minW: '0' })}>
            <h2 id="access-title" className={accessTitle}>
              {session.address ? 'Your access' : 'Connect to see your access'}
            </h2>
            <p className={muted}>
              {session.address
                ? 'Each section checks your live permissions before offering a change.'
                : 'Sections stay readable without a wallet.'}
            </p>
          </div>
        </div>
        <div className={chips}>
          {isAdmin ? <Chip tone="yours">Admin</Chip> : null}
          {hasMintAccess ? <Chip tone="yours">Can mint</Chip> : null}
          {hasGovernanceAccess ? <Chip tone="yours">Can change voting rules</Chip> : null}
          {!isAdmin && canProposeMint ? <Chip tone="live">Mint by vote</Chip> : null}
          {!isAdmin && canProposeGovernance ? <Chip tone="live">Rules by vote</Chip> : null}
          {session.address && !hasAnyAccess ? <Chip>Read only</Chip> : null}
        </div>
      </section>

      <ProposalDraftPanel daoId={daoId} />

      <Section title="Sections">
        <div>
          {sections.map((section) => (
            <ListRow
              key={section.key}
              href={daoAdminRoute(routeId, section.section)}
              title={section.label}
              meta={section.meta}
              trailing={
                config.status === 'pending' ? (
                  section.requiredForLaunch ? (
                    <Chip tone="warning">Required for launch</Chip>
                  ) : (
                    <Chip>Optional before launch</Chip>
                  )
                ) : (
                  <AccessChip access={accessFor[section.key] ?? 'open'} />
                )
              }
            />
          ))}
        </div>
      </Section>
    </PageSection>
  );
}
