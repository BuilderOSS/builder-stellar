import type { ReactNode } from 'react';
import { button } from 'styled-system/recipes';

type IconLinkButtonProps = {
  href: string;
  label: string;
  children: ReactNode;
  compact?: boolean;
};

/** External icon link (explorer, docs). Opens in a new tab. */
export function IconLinkButton({ href, label, children, compact = false }: IconLinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className={button({ variant: 'ghost', size: compact ? 'sm' : 'md', iconOnly: true })}
    >
      {children}
    </a>
  );
}
