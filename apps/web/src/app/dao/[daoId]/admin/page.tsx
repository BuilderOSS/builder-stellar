'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { PageSection } from '@/components/page-section';
import { ProposalDraftPanel } from '@/components/proposal/proposal-draft-panel';
import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryHasAuthority, treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import { useGoldskyGovernorAuthorities, useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';

function SectionCard({
  title,
  description,
  href,
  allowed,
  label
}: {
  title: string;
  description: string;
  href: Route;
  allowed: boolean;
  label: string;
}) {
  return (
    <Card p="5" style={{ opacity: allowed ? 1 : 0.72 }}>
      <Stack gap="3">
        <div>
          <Badge>{label}</Badge>
        </div>
        <Heading style={{ fontSize: '1.2rem' }}>{title}</Heading>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          {description}
        </Text>
        <Link
          href={allowed ? href : '/'}
          style={{ color: 'inherit', pointerEvents: allowed ? 'auto' : 'none', textDecoration: 'none' }}
        >
          <Badge>{allowed ? 'Open section' : 'Locked'}</Badge>
        </Link>
      </Stack>
    </Card>
  );
}

export default function AdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useDaoSessionStore();
  const { data: mintAuthorities } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: governorAuthorities } = useGoldskyGovernorAuthorities(config.tokenContractId);
  const { data: tokenOwner } = useContractOwner(config, 'token', session.address || undefined);
  const { data: governorOwner } = useContractOwner(config, 'governor', session.address || undefined);
  const { data: auctionOwner } = useContractOwner(config, 'auction', session.address || undefined);

  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasMintAccess = Boolean(isOwner || mintAuthorities?.items.some((item) => item.authority === session.address));
  const hasGovernanceAccess = Boolean(
    isOwner || governorAuthorities?.items.some((item) => item.authority === session.address)
  );
  const canProposeOwnerActions = treasuryIsOwner(config, tokenOwner) || treasuryIsOwner(config, governorOwner);
  const canProposeMint =
    treasuryIsOwner(config, tokenOwner) || treasuryHasAuthority(config.treasuryContractId, mintAuthorities?.items);
  const canProposeGovernance =
    treasuryIsOwner(config, governorOwner) ||
    treasuryHasAuthority(config.treasuryContractId, governorAuthorities?.items);
  const canProposeAuction = treasuryIsOwner(config, auctionOwner);
  const hasAnyAccess = Boolean(
    isOwner ||
    hasMintAccess ||
    hasGovernanceAccess ||
    canProposeOwnerActions ||
    canProposeMint ||
    canProposeGovernance ||
    canProposeAuction
  );

  return (
    <PageSection
      title="Admin dashboard"
      description="Role-aware entry point for owner, token, and governance operations."
    >
      <Stack gap="4">
        <Card p="5">
          <Stack gap="3">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <Badge>Connected wallet</Badge>
                <Heading style={{ fontSize: '1.2rem', marginTop: '10px' }}>Access summary</Heading>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {isOwner ? <Badge>Owner</Badge> : null}
                {hasMintAccess ? <Badge>Token Admin</Badge> : null}
                {hasGovernanceAccess ? <Badge>Governance Admin</Badge> : null}
                {!isOwner && canProposeMint ? <Badge>Mint proposals</Badge> : null}
                {!isOwner && canProposeGovernance ? <Badge>Governance proposals</Badge> : null}
                {!hasAnyAccess ? <Badge>Read only</Badge> : null}
              </div>
            </div>

            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              {session.address
                ? 'Choose a section below. The dashboard only exposes actions the connected wallet can use.'
                : 'Connect a wallet to see your available admin sections.'}
            </Text>
            {session.address ? <ShortId value={session.address} label="Connected address" /> : null}
          </Stack>
        </Card>

        <AdminSectionNav daoId={daoId} active="" />

        <ProposalDraftPanel daoId={daoId} />

        <Grid columns={{ base: 1, lg: 3 }} gap="4">
          <SectionCard
            label="Owner"
            title="Authority management"
            description="Add or remove mint and governance authorities from a single place."
            href={`/dao/${daoId}/admin/owner` as Route}
            allowed={isOwner || canProposeOwnerActions}
          />
          <SectionCard
            label="Token Admin"
            title="Mint tokens"
            description="Mint voting tokens and review the current mint authority set."
            href={`/dao/${daoId}/admin/token` as Route}
            allowed={hasMintAccess || canProposeMint}
          />
          <SectionCard
            label="Governance Admin"
            title="Update governor settings"
            description="Edit voting delay, voting period, proposal threshold, and quorum in one atomic batch."
            href={`/dao/${daoId}/admin/governance` as Route}
            allowed={hasGovernanceAccess || canProposeGovernance}
          />
          <SectionCard
            label="Owner"
            title="Auction controls"
            description="Pause or resume auction activity for emergency and maintenance operations."
            href={`/dao/${daoId}/admin/auction` as Route}
            allowed={isOwner || canProposeAuction}
          />
        </Grid>
      </Stack>
    </PageSection>
  );
}
