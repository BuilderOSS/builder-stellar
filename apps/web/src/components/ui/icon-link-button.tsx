import type { ReactNode } from 'react';

type IconLinkButtonProps = {
  href: string;
  label: string;
  children: ReactNode;
  compact?: boolean;
};

export function IconLinkButton({ href, label, children, compact = false }: IconLinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      style={{
        appearance: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: compact ? '2rem' : '2.75rem',
        height: compact ? '2rem' : '2.75rem',
        minWidth: compact ? '2rem' : '2.75rem',
        minHeight: compact ? '2rem' : '2.75rem',
        padding: 0,
        borderRadius: compact ? '8px' : '10px',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-2)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        textDecoration: 'none'
      }}
    >
      {children}
    </a>
  );
}
