'use client';

import { Check, Copy } from 'lucide-react';

type CopyIconButtonProps = {
  copied: boolean;
  onClick: () => void;
  label?: string;
  compact?: boolean;
};

export function CopyIconButton({ copied, onClick, label, compact = false }: CopyIconButtonProps) {
  const title = copied ? 'Copied' : (label ?? 'Copy');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
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
        cursor: 'pointer'
      }}
    >
      {copied ? <Check size={compact ? 14 : 16} /> : <Copy size={compact ? 14 : 16} />}
    </button>
  );
}
