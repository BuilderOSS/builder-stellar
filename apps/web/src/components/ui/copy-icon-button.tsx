'use client';

import { Check, Copy } from 'lucide-react';

type CopyIconButtonProps = {
  copied: boolean;
  onClick: () => void;
  label?: string;
};

export function CopyIconButton({ copied, onClick, label }: CopyIconButtonProps) {
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
        width: '2.75rem',
        height: '2.75rem',
        minWidth: '2.75rem',
        minHeight: '2.75rem',
        padding: 0,
        borderRadius: '10px',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-2)',
        color: 'var(--text-secondary)',
        cursor: 'pointer'
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}
