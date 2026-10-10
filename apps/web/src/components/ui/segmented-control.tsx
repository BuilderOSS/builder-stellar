'use client';

import { SegmentGroup } from '@ark-ui/react/segment-group';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const segmented = sva({
  slots: ['root', 'indicator', 'item', 'text'],
  base: {
    root: {
      position: 'relative',
      display: 'inline-flex',
      width: 'fit-content',
      justifySelf: 'start',
      p: '1',
      gap: '1',
      bg: 'hover',
      borderRadius: 'control',
      maxW: '100%'
    },
    indicator: {
      bg: 'raised',
      borderRadius: '7px',
      boxShadow: 'raised',
      width: 'var(--width)',
      height: 'var(--height)',
      top: 'var(--top)',
      left: 'var(--left)',
      transitionProperty: 'left, width',
      transitionDuration: 'pop',
      transitionTimingFunction: 'out',
      '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' }
    },
    item: {
      position: 'relative',
      zIndex: '1',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5',
      minH: '9',
      px: '3',
      borderRadius: '7px',
      textStyle: 'label',
      color: 'ink.muted',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      _checked: { color: 'ink' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '1px' },
      '& svg': { width: '4', height: '4' },
      '@media (pointer: coarse)': { minH: '10' }
    },
    text: {}
  },
  variants: {
    fill: {
      true: {
        // Span the container as equal columns that can never overflow it.
        root: {
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: 'minmax(0, 1fr)',
          width: '100%',
          justifySelf: 'stretch',
          containerType: 'inline-size'
        },
        item: {
          minW: '0',
          px: '2',
          // Ark's item control is an empty visual hook; in tight columns its flex gap would cost the label.
          '& [data-part=item-control]': { display: 'none' },
          '@container (max-width: 340px)': { px: '1.5', fontSize: '0.75rem' }
        },
        text: { overflow: 'hidden', textOverflow: 'ellipsis' }
      },
      false: {}
    }
  },
  defaultVariants: { fill: false }
});

/** Small mutually exclusive switch (Appearance, list/grid, filters). */
export function SegmentedControl({
  label,
  options,
  value,
  onValueChange,
  fill = false,
  id
}: {
  label: string;
  options: Array<{ value: string; label: ReactNode; icon?: ReactNode }>;
  value: string;
  onValueChange: (value: string) => void;
  /** Stretch across the container in equal columns (e.g. tabs in a side panel). */
  fill?: boolean;
  /** Stable id for server-rendered pages, so Ark's generated ids hydrate identically. */
  id?: string;
}) {
  const classes = segmented({ fill });
  return (
    <SegmentGroup.Root
      id={id}
      className={classes.root}
      value={value}
      onValueChange={(details) => {
        if (details.value) onValueChange(details.value);
      }}
      aria-label={label}
    >
      <SegmentGroup.Indicator className={classes.indicator} />
      {options.map((option) => (
        <SegmentGroup.Item key={option.value} value={option.value} className={classes.item}>
          {option.icon}
          <SegmentGroup.ItemText className={classes.text}>{option.label}</SegmentGroup.ItemText>
          <SegmentGroup.ItemControl />
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}
