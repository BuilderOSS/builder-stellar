'use client';

import { Check, Copy } from 'lucide-react';

import { IconButton } from './button';

type CopyIconButtonProps = {
  copied: boolean;
  onClick: () => void;
  label?: string;
  compact?: boolean;
};

export function CopyIconButton({ copied, onClick, label, compact = false }: CopyIconButtonProps) {
  return (
    <IconButton label={copied ? 'Copied' : (label ?? 'Copy')} size={compact ? 'sm' : 'md'} onClick={onClick}>
      {copied ? <Check aria-hidden="true" strokeWidth={2} /> : <Copy aria-hidden="true" strokeWidth={1.75} />}
    </IconButton>
  );
}
