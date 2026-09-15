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
        width: '1.5rem',
        height: '1.5rem',
        minWidth: '1.5rem',
        minHeight: '1.5rem',
        padding: 0,
        borderRadius: '999px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        color: 'white',
        cursor: 'pointer',
        textDecoration: 'none'
      }}
    >
      {children}
    </a>
  );
}
