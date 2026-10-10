'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { css } from 'styled-system/css';

import { Button } from './button';

const nav = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', pt: '2' });
const status = css({ textStyle: 'caption', color: 'ink.muted', fontVariantNumeric: 'tabular-nums' });

/** Previous / next paging with a plain status line. */
export function Pagination({
  label,
  page,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  status: statusText,
  disabled
}: {
  /** Accessible name for the nav landmark, e.g. "Member pages". */
  label: string;
  page?: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  status?: string;
  disabled?: boolean;
}) {
  if (!hasPrevious && !hasNext) return null;
  return (
    <nav className={nav} aria-label={label}>
      <Button variant="secondary" size="sm" onClick={onPrevious} disabled={disabled || !hasPrevious}>
        <ChevronLeft aria-hidden="true" />
        Previous
      </Button>
      <span className={status} aria-live="polite">
        {statusText ?? (page ? `Page ${page}` : '')}
      </span>
      <Button variant="secondary" size="sm" onClick={onNext} disabled={disabled || !hasNext}>
        Next
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
