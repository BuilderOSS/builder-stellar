'use client';

import { Check, Moon, Sun, SunMoon } from 'lucide-react';
import { css } from 'styled-system/css';

import { IconButton, Menu } from '@/components/ui';
import { setThemePreference, useThemePreference } from '@/components/warm-ink-theme';
import type { WarmInkPreference } from '@/lib/warm-ink-theme';

const OPTIONS: Array<{ value: WarmInkPreference; label: string; Icon: typeof Moon }> = [
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: SunMoon }
];

const row = css({ display: 'flex', alignItems: 'center', gap: '2', flex: '1' });
const tick = css({ ml: 'auto', color: 'signal' });

/**
 * Appearance in the top bar, for everyone (signed in or not). One icon-sized control that shows the
 * current choice and opens Dark, Light and System: the same three as the You sheet.
 */
export function ThemeMenu() {
  const preference = useThemePreference();
  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0];
  return (
    <Menu
      label="Appearance"
      items={OPTIONS.map(({ value, label, Icon }) => ({
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
        onSelect: () => setThemePreference(value)
      }))}
      trigger={
        <IconButton label={`Appearance: ${current.label}`} size="sm">
          <current.Icon aria-hidden="true" />
        </IconButton>
      }
    />
  );
}
