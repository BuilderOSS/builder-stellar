'use client';

import {
  applyThemePreference as applyTheme,
  currentThemePreference,
  readThemeCookie,
  saveThemePreference,
  THEME_EVENT
} from '@builder-stellar/design-tokens/theme';
import { useEffect, useSyncExternalStore } from 'react';

import {
  isWarmInkPreference,
  WARM_INK_DEFAULT_PREFERENCE,
  WARM_INK_THEME_KEY,
  type WarmInkPreference
} from '@/lib/warm-ink-theme';

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

function getPreference(): WarmInkPreference {
  return currentThemePreference(WARM_INK_DEFAULT_PREFERENCE);
}

/** Saves to the shared cookie and this app's localStorage key, then applies. */
export function setThemePreference(next: WarmInkPreference) {
  saveThemePreference(next);
}

export function useThemePreference(): WarmInkPreference {
  return useSyncExternalStore(subscribe, getPreference, () => WARM_INK_DEFAULT_PREFERENCE);
}

// One controller, no app-wide context rerenders. OS, cross-tab and docs-site changes
// (the shared cookie, re-read when the tab regains focus) share the same update path
// as the appearance control in the You sheet.
export function WarmInkThemeRuntime() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (getPreference() === 'system') applyTheme('system');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WARM_INK_THEME_KEY && event.key !== null) return;
      applyTheme(isWarmInkPreference(event.newValue) ? event.newValue : WARM_INK_DEFAULT_PREFERENCE);
    };
    const onFocus = () => {
      const shared = readThemeCookie(document.cookie);
      if (shared && shared !== getPreference()) applyTheme(shared);
    };
    applyTheme(getPreference());
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
