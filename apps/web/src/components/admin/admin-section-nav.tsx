import Link from 'next/link';

import { daoAdminRoute } from '@/lib/dao-routes';

const ITEMS: Array<{ section: string; label: string }> = [
  { section: '', label: 'Dashboard' },
  { section: '/owner', label: 'Owner' },
  { section: '/token', label: 'Token Admin' },
  { section: '/governance', label: 'Governance Admin' },
  { section: '/auction', label: 'Auction Admin' }
];

export function AdminSectionNav({ daoId, active }: { daoId: string; active: string }) {
  return (
    <nav
      aria-label="Administration sections"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '6px',
        border: '1px solid var(--border-default)',
        borderRadius: '14px',
        background: 'var(--surface-1)'
      }}
    >
      {ITEMS.map((item) => (
        <Link
          key={item.section}
          href={daoAdminRoute(daoId, item.section)}
          className="nav-link"
          aria-current={active === item.section ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
