// The theme runtime is shared with the docs site (packages/design-tokens/src/theme.ts):
// a `tribes-theme` cookie on .tribes.build first, then this app's localStorage key.
import {
  isThemePreference,
  THEME_STORAGE_KEY,
  themeBootScript,
  type ThemePreference
} from '@builder-stellar/design-tokens/theme';

export const WARM_INK_THEME_KEY = THEME_STORAGE_KEY;
export type WarmInkPreference = ThemePreference;
export const isWarmInkPreference = isThemePreference;

/** Dark is the hero theme: first visits (and denied storage) start dark. */
export const WARM_INK_DEFAULT_PREFERENCE: WarmInkPreference = 'dark';

export const warmInkBootScript = themeBootScript(WARM_INK_DEFAULT_PREFERENCE);
