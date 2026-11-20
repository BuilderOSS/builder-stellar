'use client';

import {
  applyThemePreference,
  currentThemePreference,
  isThemePreference,
  readThemeCookie,
  saveThemePreference,
  THEME_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference
} from '@builder-stellar/design-tokens/theme';
import { ThemeMenu as ThemeMenuControl, ThemeSegments } from '@builder-stellar/web/ui/theme-switch';
import { useEffect, useSyncExternalStore } from 'react';

import { DOCS_DEFAULT_THEME } from '@/lib/site';

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

const getPreference = () => currentThemePreference(DOCS_DEFAULT_THEME);

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getPreference, () => DOCS_DEFAULT_THEME);
}

/** Keeps [data-theme] in step with System changes, other tabs, and the app (shared cookie). */
export function ThemeRuntime() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (getPreference() === 'system') applyThemePreference('system');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      applyThemePreference(isThemePreference(event.newValue) ? event.newValue : DOCS_DEFAULT_THEME);
    };
    const onFocus = () => {
      const shared = readThemeCookie(document.cookie);
      if (shared && shared !== getPreference()) applyThemePreference(shared);
    };
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

/** Dark, Light and System in the header: the same control as the app's top bar, square like search. */
export function ThemeMenu() {
  return <ThemeMenuControl shape="square" preference={useThemePreference()} onChange={saveThemePreference} />;
}

/** "Appearance" with the three choices, for the mobile menu: the same row as the app's You sheet. */
export function ThemeRow({ id }: { id: string }) {
  return <ThemeSegments id={id} preference={useThemePreference()} onChange={saveThemePreference} />;
}
