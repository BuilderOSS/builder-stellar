'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
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
          href={allowed ? href : '/admin'}
          style={{ color: 'inherit', pointerEvents: allowed ? 'auto' : 'none', textDecoration: 'none' }}
        >
          <Badge>{allowed ? 'Open section' : 'Locked'}</Badge>
        </Link>
      </Stack>
    </Card>
  );
}

export default function AdminPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data: mintAuthorities } = useGoldskyMintAuthorities();
  const { data: governorAuthorities } = useGoldskyGovernorAuthorities();

  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasMintAccess = Boolean(isOwner || mintAuthorities?.items.some((item) => item.authority === session.address));
  const hasGovernanceAccess = Boolean(
    isOwner || governorAuthorities?.items.some((item) => item.authority === session.address)
  );
  const hasAnyAccess = Boolean(isOwner || hasMintAccess || hasGovernanceAccess);

  return (
    <DaoShell>
      <PageSection
        eyebrow="Admin"
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

          <AdminSectionNav active="/admin" />

          <Grid columns={{ base: 1, lg: 3 }} gap="4">
            <SectionCard
              label="Owner"
              title="Authority management"
              description="Add or remove mint and governance authorities from a single place."
              href="/admin/owner"
              allowed={isOwner}
            />
            <SectionCard
              label="Token Admin"
              title="Mint tokens"
              description="Mint voting tokens and review the current mint authority set."
              href="/admin/token"
              allowed={hasMintAccess}
            />
            <SectionCard
              label="Governance Admin"
              title="Update governor settings"
              description="Edit voting delay, voting period, proposal threshold, and quorum in one atomic batch."
              href="/admin/governance"
              allowed={hasGovernanceAccess}
            />
            <SectionCard
              label="Owner"
              title="Auction controls"
              description="Pause or resume auction activity for emergency and maintenance operations."
              href="/admin/auction"
              allowed={isOwner}
            />
          </Grid>
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
