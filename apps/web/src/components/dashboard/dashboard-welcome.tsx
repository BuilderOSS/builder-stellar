'use client';

import { ArrowRight, Compass, Plus } from 'lucide-react';
import Link from 'next/link';

import { DaoDirectory } from '@/components/dao-directory';
import { Heading, Text } from '@/components/ui';
import type { DaoConfig } from '@/lib/dao-db';

export function DashboardWelcome({ daos }: { daos: DaoConfig[] }) {
  return (
    <>
      <section className="dashboard-guest-hero" aria-labelledby="dashboard-welcome-title">
        <div className="dashboard-guest-hero__main">
          <p className="eyebrow">Open governance directory</p>
          <Heading id="dashboard-welcome-title">See what communities are building.</Heading>
          <Text className="lede">
            Explore live DAOs, follow proposals, and understand where treasuries are moving. No wallet required.
          </Text>
          <div className="dashboard-guest-hero__actions">
            <Link href="#dao-directory-title" className="nav-link dashboard-guest-hero__primary">
              <Compass aria-hidden="true" size={16} />
              Browse DAOs
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link href="/create" className="nav-link dashboard-guest-hero__secondary">
              <Plus aria-hidden="true" size={16} />
              Create a DAO
            </Link>
          </div>
        </div>
        <aside className="dashboard-guest-hero__signal" aria-label="What you can explore">
          <div className="dashboard-guest-hero__signal-heading">
            <Compass aria-hidden="true" size={16} />
            <span>Explore freely</span>
          </div>
          <strong>
            {daos.length} operational {daos.length === 1 ? 'DAO' : 'DAOs'}
          </strong>
          <Text>Start with the directory, then open any community for its proposals, members, and treasury.</Text>
          <div className="dashboard-guest-hero__topics" aria-hidden="true">
            <span>Communities</span>
            <span>Proposals</span>
            <span>Treasuries</span>
          </div>
        </aside>
      </section>
      <DaoDirectory daos={daos} />
    </>
  );
}
