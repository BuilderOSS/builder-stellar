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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '999px',
            border: active === item.href ? '1px solid rgba(0,133,255,0.42)' : '1px solid rgba(148,163,184,0.2)',
            background: active === item.href ? 'rgba(0,133,255,0.12)' : 'rgba(255,255,255,0.03)',
            color: active === item.href ? 'white' : 'rgba(177,198,220,0.88)',
            textDecoration: 'none',
            fontSize: '0.92rem',
            fontWeight: 600
          }}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
