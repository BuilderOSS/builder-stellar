'use client';

import { Check, Moon, Sun, SunMoon } from 'lucide-react';
import { css, cva } from 'styled-system/css';

import { Menu } from './menu';
import { SegmentedControl } from './segmented-control';

/**
 * Appearance: Dark, Light and System, shared by the app and the docs site. Presentational only: the
 * caller owns the preference and saves it (the app's warm-ink runtime, the docs' theme runtime).
 * - `ThemeMenu`: one icon-sized control for a top bar. It shows the current choice and opens the three.
 * - `ThemeSegments`: a compact, icon-only switch for a settings row ("Appearance" with the choices).
 */
export type ThemeChoice = 'dark' | 'light' | 'system';

export const THEME_CHOICES: Array<{ value: ThemeChoice; label: string; Icon: typeof Moon }> = [
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: SunMoon }
];

const isChoice = (value: string): value is ThemeChoice => THEME_CHOICES.some((choice) => choice.value === value);

// A 44px control that sits with its neighbours: round beside the app's wallet pill, square beside the
// docs search box. It carries the same surface and edge as they do, so it reads as a control.
const trigger = cva({
  base: {
    display: 'inline-grid',
    placeItems: 'center',
    flexShrink: '0',
    width: 'touch',
    height: 'touch',
    p: '0',
    border: '0',
    color: 'ink.muted',
    cursor: 'pointer',
    transitionProperty: 'background-color, color, box-shadow, scale',
    transitionDuration: 'fast, fast, fast, press',
    transitionTimingFunction: 'ease, ease, ease, token(easings.out)',
    _active: { scale: '0.96' },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
    _motionReduce: { _active: { scale: '1' } },
    '& svg': { width: '4.5', height: '4.5' }
  },
  variants: {
    shape: {
      round: {
        borderRadius: 'full',
        bg: 'surface',
        boxShadow: 'inset 0 0 0 1px token(colors.rule)',
        '@media (hover: hover) and (pointer: fine)': { _hover: { color: 'ink', bg: 'hover' } }
      },
      square: {
        borderRadius: 'control',
        bg: 'raised',
        boxShadow: 'inset 0 0 0 1px token(colors.rule)',
        '@media (hover: hover) and (pointer: fine)': {
          _hover: { color: 'ink', boxShadow: 'inset 0 0 0 1px token(colors.rule.strong)' }
        }
      }
    }
  },
  defaultVariants: { shape: 'round' }
});
const row = css({ display: 'flex', alignItems: 'center', gap: '2', flex: '1' });
const tick = css({ ml: 'auto', color: 'signal' });

export function ThemeMenu({
  preference,
  onChange,
  shape = 'round',
  id = 'appearance-menu'
}: {
  preference: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  shape?: 'round' | 'square';
  /** Stable for server-rendered pages (see Menu). */
  id?: string;
}) {
  const current = THEME_CHOICES.find((choice) => choice.value === preference) ?? THEME_CHOICES[0]!;
  return (
    <Menu
      id={id}
      label="Appearance"
      items={THEME_CHOICES.map(({ value, label, Icon }) => ({
        value,
        icon: <Icon aria-hidden="true" />,
        label: (
          <span className={row}>
            {label}
            {value === preference ? (
              <>
                <Check aria-hidden="true" className={tick} />
                <span className="sr-only">(selected)</span>
              </>
            ) : null}
          </span>
        ),
        onSelect: () => onChange(value)
      }))}
      trigger={
        <button
          type="button"
          className={trigger({ shape })}
          aria-label={`Appearance: ${current.label}`}
          title={`Appearance: ${current.label}`}
        >
          <current.Icon aria-hidden="true" />
        </button>
      }
    />
  );
}

const settingRow = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  minH: 'touch'
});
const settingLabel = css({ textStyle: 'label', color: 'ink.muted' });

/** "Appearance" beside three icon-only choices, for a sheet or a settings list. */
export function ThemeSegments({
  id,
  preference,
  onChange
}: {
  id?: string;
  preference: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  return (
    <div className={settingRow}>
      <span className={settingLabel} aria-hidden="true">
        Appearance
      </span>
      <SegmentedControl
        id={id}
        size="sm"
        iconOnly
        label="Appearance"
        value={preference}
        onValueChange={(next) => {
          if (isChoice(next)) onChange(next);
        }}
        options={THEME_CHOICES.map(({ value, label, Icon }) => ({
          value,
          label,
          icon: <Icon aria-hidden="true" />
        }))}
      />
    </div>
  );
}
