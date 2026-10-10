'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const steps = sva({
  slots: ['root', 'counter', 'list', 'item', 'button', 'marker', 'label'],
  base: {
    root: { display: 'grid', gap: '2' },
    counter: { textStyle: 'caption', color: 'ink.muted', display: { base: 'block', md: 'none' } },
    list: {
      display: 'grid',
      gridAutoFlow: 'column',
      gridAutoColumns: '1fr',
      gap: '1.5',
      listStyle: 'none',
      p: '0',
      m: '0'
    },
    item: { minW: '0' },
    button: {
      display: 'grid',
      gap: '2',
      width: '100%',
      p: '0',
      bg: 'transparent',
      border: '0',
      color: 'ink.muted',
      textAlign: 'left',
      cursor: 'default',
      '&:not(:disabled)': { cursor: 'pointer' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '4px', borderRadius: 'sm' },
      '&[data-state=current]': { color: 'ink' },
      '&[data-state=done]': { color: 'ink' }
    },
    marker: {
      position: 'relative',
      height: '1',
      borderRadius: 'full',
      bg: 'hover',
      '[data-state=current] > &': { bg: 'signal' },
      '[data-state=done] > &': { bg: 'signal.edge' }
    },
    label: {
      display: { base: 'none', md: 'flex' },
      alignItems: 'center',
      gap: '1.5',
      textStyle: 'label',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      '& svg': { width: '3.5', height: '3.5', color: 'success', flexShrink: '0' }
    }
  }
});

/**
 * Segmented progress for wizards. Phones show "Step 2 of 4 · Membership";
 * wider screens label every step. Completed steps are clickable when
 * `onSelect` is given.
 */
export function ProgressSteps({
  steps: items,
  current,
  onSelect,
  canSelect
}: {
  steps: Array<{ id: string; label: ReactNode }>;
  current: number;
  onSelect?: (index: number) => void;
  canSelect?: (index: number) => boolean;
}) {
  const classes = steps();
  const currentItem = items[current];
  return (
    <nav className={classes.root} aria-label="Progress">
      <p className={classes.counter}>
        Step {current + 1} of {items.length}
        {currentItem ? <> · {currentItem.label}</> : null}
      </p>
      <ol className={classes.list}>
        {items.map((item, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
          const selectable = Boolean(onSelect) && index !== current && (canSelect ? canSelect(index) : index < current);
          return (
            <li key={item.id} className={classes.item}>
              <button
                type="button"
                className={classes.button}
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                disabled={!selectable}
                onClick={() => onSelect?.(index)}
              >
                <span className={classes.marker} aria-hidden="true" />
                <span className={classes.label}>
                  {state === 'done' ? <Check aria-hidden="true" strokeWidth={3} /> : null}
                  {item.label}
                </span>
                <span className="sr-only">
                  {state === 'done' ? ', completed' : state === 'current' ? ', current step' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
