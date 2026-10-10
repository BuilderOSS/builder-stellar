'use client';

import { RadioGroup } from '@ark-ui/react/radio-group';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const choice = sva({
  slots: ['root', 'label', 'list', 'item', 'indicator', 'text', 'description'],
  base: {
    root: { display: 'grid', gap: '2', containerType: 'inline-size' },
    label: { textStyle: 'label', color: 'ink' },
    list: {
      display: 'grid',
      gap: '2',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      // Density rule 4: three or more options stack in narrow containers.
      '@container (max-width: 480px)': { gridTemplateColumns: '1fr' }
    },
    item: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: '2.5',
      minH: '52px',
      px: '3.5',
      py: '2.5',
      borderRadius: 'control',
      bg: 'raised',
      boxShadow: 'inset 0 0 0 1px token(colors.rule)',
      color: 'ink',
      fontWeight: '600',
      cursor: 'pointer',
      transitionProperty: 'box-shadow, background-color, scale',
      transitionDuration: 'press',
      transitionTimingFunction: 'out',
      _active: { scale: '0.98' },
      '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
      _checked: { boxShadow: 'inset 0 0 0 2px var(--choice-color, token(colors.signal))', bg: 'raised' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
      _disabled: { opacity: '0.5', cursor: 'not-allowed', _active: { scale: '1' } },
      '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } },
      '& svg': { width: '4.5', height: '4.5', flexShrink: '0' }
    },
    indicator: {
      width: '4',
      height: '4',
      flexShrink: '0',
      borderRadius: 'full',
      boxShadow: 'inset 0 0 0 1.5px token(colors.rule.strong)',
      _checked: { boxShadow: 'inset 0 0 0 5px var(--choice-color, token(colors.signal))' }
    },
    text: { display: 'grid', gap: '0.5', minW: '0' },
    description: { textStyle: 'caption', color: 'ink.muted', fontWeight: '400' }
  }
});

export type ChoiceOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Tone for the selected ring, e.g. For = success, Against = danger. */
  tone?: 'success' | 'danger' | 'neutral';
};

const TONE_VAR: Record<NonNullable<ChoiceOption['tone']>, string> = {
  success: 'var(--colors-success)',
  danger: 'var(--colors-danger)',
  neutral: 'var(--colors-ink-muted)'
};

/**
 * Visible, focusable choice tiles backed by a real radio group. Replaces the
 * hidden-radio "pills": every tile shows focus and works with arrow keys.
 */
export function ChoiceGroup({
  label,
  options,
  value,
  onValueChange,
  name,
  disabled
}: {
  label: ReactNode;
  options: ChoiceOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
}) {
  const classes = choice();
  return (
    <RadioGroup.Root
      className={classes.root}
      value={value}
      onValueChange={(details) => {
        if (details.value) onValueChange(details.value);
      }}
      name={name}
      disabled={disabled}
    >
      <RadioGroup.Label className={classes.label}>{label}</RadioGroup.Label>
      <div className={classes.list}>
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={classes.item}
            style={option.tone ? ({ '--choice-color': TONE_VAR[option.tone] } as React.CSSProperties) : undefined}
          >
            {option.icon ?? <RadioGroup.ItemControl className={classes.indicator} />}
            <span className={classes.text}>
              <RadioGroup.ItemText>{option.label}</RadioGroup.ItemText>
              {option.description ? <span className={classes.description}>{option.description}</span> : null}
            </span>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        ))}
      </div>
    </RadioGroup.Root>
  );
}
