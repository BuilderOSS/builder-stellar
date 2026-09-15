import type { Route } from 'next';
import Link from 'next/link';

const ITEMS: Array<{ href: Route; label: string }> = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/owner', label: 'Owner' },
  { href: '/admin/token', label: 'Token Admin' },
  { href: '/admin/governance', label: 'Governance Admin' },
  { href: '/admin/auction', label: 'Auction Admin' }
];

export function AdminSectionNav({ active }: { active: Route }) {
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
          key={item.href}
          href={item.href}
          className="nav-link"
          aria-current={active === item.href ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
