'use client';

import type { Route } from 'next';
import Link from 'next/link';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';

/** Add owned surfaces without changing the shared governance navigation. */
export function AdminSurfaceNav({
  daoId,
  active,
  showDraftTray = true
}: {
  daoId: string;
  active: string;
  showDraftTray?: boolean;
}) {
  return (
    <>
      <AdminSectionNav daoId={daoId} active={active} showDraftTray={showDraftTray} />
      <nav aria-label="Artwork, founder and module administration" className="admin-section-nav">
        {[
          { path: '/artwork', label: 'Artwork' },
          { path: '/founders', label: 'Founder allocation' },
          { path: '/claims', label: 'Claim allocations' },
          { path: '/upgrades', label: 'Module versions' },
          { path: '/marketplace', label: 'Marketplace' }
        ].map(({ path, label }) => (
          <Link
            key={path}
            href={`/dao/${daoId}/admin${path}` as Route}
            className="nav-link"
            aria-current={active === path ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
