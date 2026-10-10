'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { TtlExpiryPanel } from '@/components/admin/ttl-expiry-panel';
import { PageSection } from '@/components/page-section';
import { ProposalDraftPanel } from '@/components/proposal/proposal-draft-panel';
import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryHasAuthority, treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { useAdminTokenState } from '@/lib/admin-surfaces';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';

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
        <Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>
          <Badge>{allowed ? 'Open section' : 'View section'}</Badge>
        </Link>
      </Stack>
    </Card>
  );
}

export default function AdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
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

  return (
    <PageSection
      title="Admin dashboard"
      description="Role-aware entry point for admin, token, and governance operations."
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
                {isAdmin ? <Badge>Admin</Badge> : null}
                {hasMintAccess ? <Badge>Token Admin</Badge> : null}
                {hasGovernanceAccess ? <Badge>Governance Admin</Badge> : null}
                {!isAdmin && canProposeMint ? <Badge>Mint proposals</Badge> : null}
                {!isAdmin && canProposeGovernance ? <Badge>Governance proposals</Badge> : null}
                {!hasAnyAccess ? <Badge>Read only</Badge> : null}
              </div>
            </div>

            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              {session.address
                ? 'Choose a section below. Each section checks current on-chain authority before offering actions.'
                : 'Connect a wallet to see your available admin sections.'}
            </Text>
            {session.address ? <ShortId value={session.address} label="Connected address" /> : null}
          </Stack>
        </Card>

        <TtlExpiryPanel config={config} />

        <AdminSectionNav daoId={daoId} active="" showDraftTray={false} />

        <ProposalDraftPanel daoId={daoId} />

        <Grid columns={{ base: 1, lg: 3 }} gap="4">
          <SectionCard
            label="Admin"
            title="Authority management"
            description="Add or remove mint authorities from a single place."
            href={`/dao/${daoId}/admin/owner` as Route}
            allowed={isAdmin || canProposeAdminActions}
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
            description="Edit voting timings, queue delay, proposal threshold and quorum individually or prepare a governance draft."
            href={`/dao/${daoId}/admin/governance` as Route}
            allowed={hasGovernanceAccess || canProposeGovernance}
          />
          <SectionCard
            label="Admin"
            title="Auction controls"
            description="Pause or resume auction activity for emergency and maintenance operations."
            href={`/dao/${daoId}/admin/auction` as Route}
            allowed={isAdmin || canProposeAuction}
          />
          <SectionCard
            label="Artwork"
            title="Artwork and metadata"
            description="Read properties and IPFS references, install setup artwork, and prepare metadata updates."
            href={`/dao/${daoId}/admin/artwork` as Route}
            allowed={true}
          />
          <SectionCard
            label="Setup"
            title="Founder allocation"
            description="Review setup supply and mint founder recipient and amount vectors before launch."
            href={`/dao/${daoId}/admin/founders` as Route}
            allowed={true}
          />
          <SectionCard
            label="Code"
            title="Module versions"
            description="Read active WASM hashes and check Manager-approved upgrade transitions."
            href={`/dao/${daoId}/admin/upgrades` as Route}
            allowed={true}
          />
        </Grid>
      </Stack>
    </PageSection>
  );
}
