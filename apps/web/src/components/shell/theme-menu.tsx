'use client';

import { ThemeMenu as ThemeMenuControl } from '@/components/ui/theme-switch';
import { setThemePreference, useThemePreference } from '@/components/warm-ink-theme';

/**
 * Appearance in the top bar, for everyone (signed in or not): a round control beside the wallet
 * pill, with the same surface and edge, that opens Dark, Light and System.
 */
export function ThemeMenu() {
  return <ThemeMenuControl preference={useThemePreference()} onChange={setThemePreference} />;
}
