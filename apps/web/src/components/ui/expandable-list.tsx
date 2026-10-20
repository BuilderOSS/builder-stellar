'use client';

import { type ReactNode, useId, useRef, useState } from 'react';
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

export function ScrollArea({
  label,
  children,
  regionRef
}: {
  label: string;
  children: ReactNode;
  regionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={regionRef} className={scroll} role="region" aria-label={label} tabIndex={0}>
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
  const regionRef = useRef<HTMLDivElement>(null);
  const id = useId();
  if (!expandable) return <>{preview}</>;
  return (
    <div>
      <div id={id}>
        {expanded ? (
          <ScrollArea label={label} regionRef={regionRef}>
            {children}
          </ScrollArea>
        ) : (
          preview
        )}
      </div>
      <div className={css({ display: 'flex', justifyContent: 'center', pt: '3' })}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => {
            if (!expanded) {
              // The region mounts after this event; focus it before the next Tab.
              setExpanded(true);
              requestAnimationFrame(() => regionRef.current?.focus());
            } else setExpanded(false);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      </div>
    </div>
  );
}
