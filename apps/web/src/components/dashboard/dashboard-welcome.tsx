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
          <p className="eyebrow">Find your community</p>
          <Heading id="dashboard-welcome-title">Governance, in the open.</Heading>
          <Text className="lede">
            Explore DAOs, follow the ideas shaping them, and see how each community makes decisions together.
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
      </section>
      <DaoDirectory daos={daos} />
    </>
  );
}
