'use client';

import { ArrowRight, Compass, Plus } from 'lucide-react';
import Link from 'next/link';

import { Heading, Text } from '@/components/ui';

export function DashboardWelcome() {
  return (
    <section className="dashboard-empty-state" aria-labelledby="dashboard-welcome-title">
      <p className="eyebrow">Welcome to Stellar DAOs</p>
      <Heading id="dashboard-welcome-title" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', margin: '8px 0 12px' }}>
        Find a community to follow, or start one of your own.
      </Heading>
      <Text className="lede" style={{ maxWidth: '620px' }}>
        Explore live DAO directories, governance activity, and community details on Stellar. You can browse without
        connecting a wallet.
      </Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '28px' }}>
        <Link
          href="/?tab=discover"
          className="nav-link"
          style={{ background: 'var(--action)', color: 'var(--surface-0)' }}
        >
          <Compass aria-hidden="true" size={16} />
          Explore DAOs
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <Link href="/create" className="nav-link">
          <Plus aria-hidden="true" size={16} />
          Create DAO
        </Link>
      </div>
    </section>
  );
}
