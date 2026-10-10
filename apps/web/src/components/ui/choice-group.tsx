'use client';

import { RadioGroup } from '@ark-ui/react/radio-group';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const choice = sva({
  slots: ['root', 'label', 'list', 'item', 'indicator', 'text', 'description', 'check', 'badge'],
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
    description: { textStyle: 'caption', color: 'ink.muted', fontWeight: '400' },
    check: { display: 'none' },
    badge: { display: 'none' }
  },
  variants: {
    variant: {
      tile: {},
      // Bigger cards for "pick what kind of thing this is" choices.
      card: {
        list: {
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '3',
          '@container (max-width: 480px)': { gridTemplateColumns: 'minmax(0, 1fr)' }
        },
        item: {
          display: 'grid',
          alignContent: 'start',
          alignItems: 'start',
          gap: '2',
          p: '4',
          pr: '10',
          borderRadius: 'card',
          transitionProperty: 'box-shadow, background-color, scale',
          transitionDuration: 'fast, fast, press',
          transitionTimingFunction: 'ease, ease, token(easings.out)',
          _active: { scale: '0.96' },
          '& > svg': { width: '5', height: '5', color: 'ink.muted' },
          '&[data-state=checked] > svg': { color: 'signal' }
        },
        text: { gap: '1' },
        description: { fontSize: '0.875rem', lineHeight: '1.45' },
        // Number-free selection mark: the check cross-fades in when the card is picked.
        check: {
          display: 'grid',
          placeItems: 'center',
          position: 'absolute',
          top: '3.5',
          right: '3.5',
          width: '5',
          height: '5',
          borderRadius: 'full',
          bg: 'signal',
          color: 'primary.fg',
          opacity: '0',
          transform: 'scale(0.25)',
          filter: 'blur(4px)',
          transitionProperty: 'opacity, transform, filter',
          transitionDuration: '200ms',
          transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
          '[data-state=checked] > &': { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)' },
          '& svg': { width: '3', height: '3' },
          _motionReduce: { transitionProperty: 'opacity', transform: 'none', filter: 'none' }
        },
        badge: {
          display: 'inline-flex',
          justifySelf: 'start',
          px: '2',
          py: '0.5',
          borderRadius: 'full',
          bg: 'signal.wash',
          color: 'signal',
          textStyle: 'micro',
          fontWeight: '600'
        }
      }
    }
  },
  defaultVariants: { variant: 'tile' }
});

export type ChoiceOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Short tag shown on card choices, e.g. Recommended. */
  badge?: ReactNode;
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
  disabled,
  variant = 'tile'
}: {
  label: ReactNode;
  options: ChoiceOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  /** `card` for a few big, described options; `tile` (default) for compact rows like a vote. */
  variant?: 'tile' | 'card';
}) {
  const classes = choice({ variant });
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
            {option.icon ?? (variant === 'card' ? null : <RadioGroup.ItemControl className={classes.indicator} />)}
            <span className={classes.text}>
              <RadioGroup.ItemText>{option.label}</RadioGroup.ItemText>
              {option.description ? <span className={classes.description}>{option.description}</span> : null}
            </span>
            {variant === 'card' && option.badge ? <span className={classes.badge}>{option.badge}</span> : null}
            {variant === 'card' ? (
              <span className={classes.check} aria-hidden="true">
                <Check strokeWidth={3} />
              </span>
            ) : null}
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        ))}
      </div>
    </RadioGroup.Root>
  );
}
