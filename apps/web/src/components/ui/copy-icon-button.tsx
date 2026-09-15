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
        width: '1.5rem',
        height: '1.5rem',
        minWidth: '1.5rem',
        minHeight: '1.5rem',
        padding: 0,
        borderRadius: '999px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        color: 'white',
        cursor: 'pointer'
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
