'use client';

import { type ReactNode, useId, useState } from 'react';
import { css } from 'styled-system/css';

import { Button } from './button';

const scroll = css({
  maxH: '96',
  overflowY: 'auto',
  overscrollBehaviorY: 'contain',
  minW: '0',
  scrollbarGutter: 'stable',
  pr: '1',
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' }
});

export function ScrollArea({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={scroll} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

/** A compact preview that opens into a bounded, keyboard-scrollable list. */
export function ExpandableList({
  label,
  preview,
  expandable = true,
  children
}: {
  label: string;
  preview: ReactNode;
  expandable?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!expandable) return <>{preview}</>;
  return (
    <div>
      <div id={id}>{expanded ? <ScrollArea label={label}>{children}</ScrollArea> : preview}</div>
      <div className={css({ display: 'flex', justifyContent: 'center', pt: '3' })}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      </div>
    </div>
  );
}
