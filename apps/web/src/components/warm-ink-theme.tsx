'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  isWarmInkPreference,
  WARM_INK_DEFAULT_PREFERENCE,
  WARM_INK_THEME_KEY,
  type WarmInkPreference
} from '@/lib/warm-ink-theme';

const THEME_EVENT = 'builder:warm-ink-theme';

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

function getPreference(): WarmInkPreference {
  const preference = document.documentElement.dataset.themePreference;
  return isWarmInkPreference(preference) ? preference : WARM_INK_DEFAULT_PREFERENCE;
}

function applyTheme(preference: WarmInkPreference) {
  const root = document.documentElement;
  const resolved =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  const changed = root.dataset.theme !== resolved;
  if (changed) root.setAttribute('data-theme-switching', '');
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  if (changed) {
    // Flush the new colors with transitions suppressed, then restore motion.
    void root.offsetHeight;
    requestAnimationFrame(() => root.removeAttribute('data-theme-switching'));
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function setThemePreference(next: WarmInkPreference) {
  try {
    window.localStorage.setItem(WARM_INK_THEME_KEY, next);
  } catch {
    /* In-memory theme still works. */
  }
  applyTheme(next);
}

export function useThemePreference(): WarmInkPreference {
  return useSyncExternalStore(subscribe, getPreference, () => WARM_INK_DEFAULT_PREFERENCE);
}

// One controller, no app-wide context rerenders. OS and cross-tab changes share
// the same update path as the appearance control in the You sheet.
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
    applyTheme(getPreference());
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}
