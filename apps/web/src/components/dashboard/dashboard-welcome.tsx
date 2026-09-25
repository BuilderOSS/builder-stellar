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
        <p className="eyebrow">Explore Stellar governance</p>
        <Heading id="dashboard-welcome-title">Find a DAO to explore.</Heading>
        <Text className="lede">
          Browse communities, proposals, and treasury activity. You can explore without connecting a wallet.
        </Text>
        <div className="dashboard-guest-hero__actions">
          <Link href="#dao-directory-title" className="nav-link dashboard-guest-hero__primary">
            <Compass aria-hidden="true" size={16} />
            Explore DAOs
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <Link href="/create" className="nav-link dashboard-guest-hero__secondary">
            <Plus aria-hidden="true" size={16} />
            Create a DAO
          </Link>
        </div>
      </section>
      <DaoDirectory daos={daos} />
    </>
  );
}
