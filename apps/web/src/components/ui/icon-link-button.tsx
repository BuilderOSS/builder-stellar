import type { ReactNode } from 'react';

type IconLinkButtonProps = {
  href: string;
  label: string;
  children: ReactNode;
};

export function IconLinkButton({ href, label, children }: IconLinkButtonProps) {
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
        width: '2.75rem',
        height: '2.75rem',
        minWidth: '2.75rem',
        minHeight: '2.75rem',
        padding: 0,
        borderRadius: '10px',
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
