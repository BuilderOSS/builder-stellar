'use client';

import { Checkbox as ArkCheckbox } from '@ark-ui/react/checkbox';
import { Switch as ArkSwitch } from '@ark-ui/react/switch';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const switchStyles = sva({
  slots: ['root', 'control', 'thumb', 'label', 'description'],
  base: {
    root: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '4',
      minH: 'touch',
      py: '1',
      cursor: 'pointer',
      _disabled: { opacity: '0.55', cursor: 'not-allowed' }
    },
    control: {
      position: 'relative',
      flexShrink: '0',
      width: '11',
      height: '26px',
      mt: '0.5',
      borderRadius: 'full',
      bg: 'rule.strong',
      transitionProperty: 'background-color',
      transitionDuration: 'fast',
      _checked: { bg: 'primary' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
    },
    thumb: {
      position: 'absolute',
      top: '3px',
      left: '3px',
      width: '5',
      height: '5',
      borderRadius: 'full',
      bg: 'white',
      boxShadow: 'raised',
      transitionProperty: 'translate',
      transitionDuration: 'pop',
      transitionTimingFunction: 'out',
      _checked: { translate: '18px 0' },
      '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' }
    },
    label: { textStyle: 'body', fontWeight: '600', color: 'ink', display: 'grid', gap: '0.5' },
    description: { textStyle: 'caption', color: 'ink.muted', fontWeight: '400' }
  }
});

export function Switch({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  name
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  const classes = switchStyles();
  return (
    <ArkSwitch.Root
      className={classes.root}
      checked={checked}
      onCheckedChange={(details) => onCheckedChange(details.checked)}
      disabled={disabled}
      name={name}
    >
      <ArkSwitch.Label className={classes.label}>
        {label}
        {description ? <span className={classes.description}>{description}</span> : null}
      </ArkSwitch.Label>
      <ArkSwitch.Control className={classes.control}>
        <ArkSwitch.Thumb className={classes.thumb} />
      </ArkSwitch.Control>
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  );
}

const checkboxStyles = sva({
  slots: ['root', 'control', 'indicator', 'label', 'description'],
  base: {
    root: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '3',
      minH: 'touch',
      py: '2',
      cursor: 'pointer',
      _disabled: { opacity: '0.55', cursor: 'not-allowed' }
    },
    control: {
      display: 'grid',
      placeItems: 'center',
      flexShrink: '0',
      width: '5',
      height: '5',
      mt: '0.5',
      borderRadius: '6px',
      bg: 'raised',
      boxShadow: 'inset 0 0 0 1.5px token(colors.rule.strong)',
      color: 'primary.fg',
      transitionProperty: 'background-color, box-shadow',
      transitionDuration: 'fast',
      _checked: { bg: 'primary', boxShadow: 'none' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
    },
    indicator: { width: '3.5', height: '3.5' },
    label: { textStyle: 'body', color: 'ink', display: 'grid', gap: '0.5' },
    description: { textStyle: 'caption', color: 'ink.muted' }
  }
});

export function Checkbox({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  name
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  const classes = checkboxStyles();
  return (
    <ArkCheckbox.Root
      className={classes.root}
      checked={checked}
      onCheckedChange={(details) => onCheckedChange(details.checked === true)}
      disabled={disabled}
      name={name}
    >
      <ArkCheckbox.Control className={classes.control}>
        <ArkCheckbox.Indicator>
          <Check aria-hidden="true" className={classes.indicator} strokeWidth={3} />
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      <ArkCheckbox.Label className={classes.label}>
        {label}
        {description ? <span className={classes.description}>{description}</span> : null}
      </ArkCheckbox.Label>
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  );
}
