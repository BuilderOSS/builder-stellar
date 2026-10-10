'use client';

import { css } from 'styled-system/css';

import { ContractUpdatesNotice } from '@/components/admin/contract-updates-notice';
import { TtlExpiryPanel } from '@/components/admin/ttl-expiry-panel';
import { PageSection } from '@/components/page-section';
import { ProposalDraftPanel } from '@/components/proposal/proposal-draft-panel';
import { Avatar, Chip, Disclosure, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryHasAuthority, treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { useAdminTokenState } from '@/lib/admin-surfaces';
import { daoAdminRoute } from '@/lib/dao-routes';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
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

/** Manage sections the launch checklist depends on. */
const REQUIRED_FOR_LAUNCH = new Set(['artwork', 'founders']);

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
  const { data: mintAuthorities } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: tokenAdmin } = useContractAdmin(config, 'token', session.address || undefined);
  const { data: governorAdmin } = useContractAdmin(config, 'governor', session.address || undefined);
  const { data: auctionAdmin } = useContractAdmin(config, 'auction', session.address || undefined);

  const token = useAdminTokenState(config, session.address);
  const isAdmin = Boolean(session.address && token.data?.admin === session.address);
  const hasMintAccess = Boolean(isAdmin || token.data?.mintAuthority);
  const hasGovernanceAccess = Boolean(session.address && governorAdmin === session.address);
  const canProposeAdminActions = treasuryIsAdmin(config, tokenAdmin) || treasuryIsAdmin(config, governorAdmin);
  const canProposeMint =
    treasuryIsAdmin(config, tokenAdmin) || treasuryHasAuthority(config.treasuryContractId, mintAuthorities?.items);
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

  const sections: Array<{ key: string; title: string; meta: string; href: string; access: Access }> = [
    {
      key: 'profile',
      title: 'Community profile',
      meta: 'Name, image, description and website',
      href: daoAdminRoute(routeId, '/profile'),
      access: access(isAdmin, canProposeAdminActions)
    },
    {
      key: 'token',
      title: 'Mint tokens',
      meta: 'Create new membership tokens',
      href: daoAdminRoute(routeId, '/token'),
      access: access(hasMintAccess, canProposeMint)
    },
    {
      key: 'founders',
      title: 'Founder tokens',
      meta: 'Tokens for the founding team, before launch',
      href: daoAdminRoute(routeId, '/founders'),
      access: 'open'
    },
    {
      key: 'artwork',
      title: 'Artwork',
      meta: 'The art every token is drawn from',
      href: daoAdminRoute(routeId, '/artwork'),
      access: 'open'
    },
    {
      key: 'governance',
      title: 'Voting rules',
      meta: 'Timing, quorum and who can propose',
      href: daoAdminRoute(routeId, '/governance'),
      access: access(hasGovernanceAccess, canProposeGovernance)
    },
    {
      key: 'owner',
      title: 'Who can mint',
      meta: 'Accounts allowed to mint tokens',
      href: daoAdminRoute(routeId, '/owner'),
      access: access(isAdmin, canProposeAdminActions)
    },
    {
      key: 'auction',
      title: 'Auction',
      meta: 'Pause, pricing and timing',
      href: daoAdminRoute(routeId, '/auction'),
      access: access(isAdmin, canProposeAuction)
    },
    {
      key: 'upgrades',
      title: 'Contract versions',
      meta: 'Review and propose upgrades',
      href: daoAdminRoute(routeId, '/upgrades'),
      access: 'open'
    }
  ];

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
              href={section.href}
              title={section.title}
              meta={section.meta}
              trailing={
                config.status === 'pending' ? (
                  REQUIRED_FOR_LAUNCH.has(section.key) ? (
                    <Chip tone="warning">Required for launch</Chip>
                  ) : (
                    <Chip>Optional before launch</Chip>
                  )
                ) : (
                  <AccessChip access={section.access} />
                )
              }
            />
          ))}
        </div>
      </Section>

      <Disclosure title="Storage renewal">
        <TtlExpiryPanel config={config} />
      </Disclosure>
    </PageSection>
  );
}
