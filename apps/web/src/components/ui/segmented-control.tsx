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
  }
});

/** Small mutually exclusive switch (Appearance, list/grid, filters). */
export function SegmentedControl({
  label,
  options,
  value,
  onValueChange
}: {
  label: string;
  options: Array<{ value: string; label: ReactNode; icon?: ReactNode }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const classes = segmented();
  return (
    <SegmentGroup.Root
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
