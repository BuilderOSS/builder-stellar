import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { DaoDirectory } from '@/components/dao-directory';
import { Callout, Heading, Text } from '@/components/ui';
import { WalletControls } from '@/components/wallet-controls';
import { type DaoConfig, getAllDaosFromDatabase } from '@/lib/dao-db';

export const metadata: Metadata = {
  title: 'Explore Stellar DAOs',
  description: 'Discover operational DAOs and explore their governance, membership, auctions, and treasury activity.'
};

function networkLabel(network: string | undefined) {
  if (network === 'public') return 'Mainnet';
  if (network === 'local') return 'Local';
  return 'Testnet';
}

export default async function Page() {
  let daos: DaoConfig[] = [];
  let loadError = false;

  try {
    daos = await getAllDaosFromDatabase('operational');
  } catch {
    loadError = true;
  }

  return (
    <div className="page-shell">
      <div className="app-frame discovery-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>

        <header className="discovery-header">
          <Link className="brand-lockup" href="/" aria-label="Stellar DAO directory">
            <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
            <div className="brand-copy">
              <p className="brand-name">Stellar DAOs</p>
              <p className="brand-kicker">Governance directory</p>
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/create" className="nav-link">
              <Plus aria-hidden="true" size={16} strokeWidth={2} />
              Create DAO
            </Link>
            <div className="discovery-header__context">
              <span className="network-dot" aria-hidden="true" />
              <span>Onchain communities</span>
            </div>
            <WalletControls />
          </div>
        </header>

        <main id="main-content" className="discovery-main" tabIndex={-1}>
          <section className="discovery-hero" aria-labelledby="discovery-title">
            <div className="discovery-hero__copy">
              <p className="eyebrow">Stellar governance, in one place</p>
              <h1 className="page-title" id="discovery-title">
                Explore the communities building onchain.
              </h1>
              <p className="lede">
                Find a DAO, open its dashboard, and follow the decisions, members, auctions, and treasury activity that
                move it forward.
              </p>
            </div>
            <div className="discovery-hero__signal" aria-label="Directory summary">
              <span className="label">Directory status</span>
              <strong>{loadError ? 'Sync paused' : daos.length ? 'Live directory' : 'Waiting for DAOs'}</strong>
              <span>{loadError ? 'Database unavailable' : 'Operational communities only'}</span>
            </div>
          </section>

          <section className="discovery-overview" aria-label="Directory overview">
            <div className="discovery-overview__primary">
              <span className="label">Operational DAOs</span>
              <strong>{loadError ? '—' : daos.length}</strong>
              <span>{loadError ? 'Unable to load the directory' : 'Ready to explore'}</span>
            </div>
            <div className="discovery-overview__item">
              <span className="label">Network</span>
              <strong>{networkLabel(daos[0]?.network)}</strong>
              <span>Stellar ecosystem</span>
            </div>
            <div className="discovery-overview__item">
              <span className="label">What you can inspect</span>
              <strong>Governance + assets</strong>
              <span>Proposals, members, auctions, treasury</span>
            </div>
          </section>

          {loadError ? (
            <Callout
              variant="error"
              title="DAO discovery is temporarily unavailable"
              description="The directory could not reach its indexed data. Try again later or open a DAO directly if you have its URL."
            />
          ) : daos.length ? (
            <DaoDirectory daos={daos} />
          ) : (
            <div className="empty-state discovery-empty-state" role="status">
              <p className="eyebrow">Directory is ready</p>
              <Heading style={{ fontSize: '1.25rem', margin: '8px 0' }}>No operational DAOs yet</Heading>
              <Text className="lede">Once a DAO is finalized and indexed, it will appear here.</Text>
            </div>
          )}
        </main>

        <footer className="app-footer discovery-footer">
          <span>Built for transparent, community-owned coordination.</span>
          <span>Stellar network directory</span>
        </footer>
      </div>
    </div>
  );
}
