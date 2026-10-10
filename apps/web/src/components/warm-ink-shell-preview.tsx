'use client';

import Link from 'next/link';

import { DaoShell } from '@/components/dao-shell';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { NETWORKS } from '@/config/networks';
import { DaoProvider } from '@/contexts/dao-context';
import type { DaoNetworkConfig } from '@/lib/dao-config';

// Explicitly inert design fixture, not an API response. Empty contract addresses
// keep DAO query hooks disabled; this route is only served in development.
const fixture: DaoNetworkConfig = {
  name: 'testnet',
  label: NETWORKS.testnet.label,
  rpcUrl: NETWORKS.testnet.rpcUrl,
  passphrase: NETWORKS.testnet.networkPassphrase,
  tokenName: 'Warm Ink community',
  tokenSymbol: 'PREVIEW',
  tokenDescription: 'Development-only shell fixture',
  adminAddress: '',
  launchAdmin: '',
  tokenContractId: '',
  metadataContractId: '',
  contractImage: '',
  governorContractId: '',
  treasuryContractId: '',
  auctionContractId: '',
  marketplaceContractId: '',
  auctionEnabled: false,
  auctionPaused: true,
  status: 'operational'
};

export function WarmInkShellPreview() {
  return (
    <DaoProvider daoId="warm-ink-design-fixture" daoConfig={fixture}>
      <DaoShell>
        <div className="stack">
          <div className="page-intro">
            <p className="eyebrow">Development-only shell preview</p>
            <h1 className="page-title">Now in your community.</h1>
            <p className="lede">
              The actual DAO shell, with empty contract addresses. No DAO data or transactions are simulated.
            </p>
          </div>
          <Callout
            title="Design fixture only"
            description="Navigation targets illustrate the production route structure, but this fixture is not a real DAO. Do not connect a wallet here."
          />
          <Card className="stack">
            <h2 className="display-type" style={{ fontSize: '2rem' }}>
              A calm place for consequential work.
            </h2>
            <p className="lede">
              Check the workspace identity, appearance control, labeled navigation, and keyboard-operated mobile menus
              at every breakpoint.
            </p>
            <Button asChild variant="outline">
              <Link href="/warm-ink-preview">Back to primitives</Link>
            </Button>
          </Card>
        </div>
      </DaoShell>
    </DaoProvider>
  );
}
