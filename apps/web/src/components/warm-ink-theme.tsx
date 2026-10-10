'use client';

import { Monitor } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { isWarmInkPreference, WARM_INK_THEME_KEY, type WarmInkPreference } from '@/lib/warm-ink-theme';

const THEME_EVENT = 'builder:warm-ink-theme';

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

function getPreference(): WarmInkPreference {
  const preference = document.documentElement.dataset.themePreference;
  return isWarmInkPreference(preference) ? preference : 'system';
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

export function WarmInkThemeControl() {
  const preference = useSyncExternalStore(subscribe, getPreference, () => 'system' as const);
  return (
    <label className="warm-ink-theme-control">
      <Monitor size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        value={preference}
        onChange={(event) => {
          const next = event.target.value;
          if (!isWarmInkPreference(next)) return;
          try {
            window.localStorage.setItem(WARM_INK_THEME_KEY, next);
          } catch {
            /* In-memory theme still works. */
          }
          applyTheme(next);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

// One controller, no app-wide context rerenders. OS and cross-tab changes share
// the same update path as the shell control.
export function WarmInkThemeRuntime() {
  const pathname = usePathname();
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (getPreference() === 'system') applyTheme('system');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WARM_INK_THEME_KEY && event.key !== null) return;
      applyTheme(isWarmInkPreference(event.newValue) ? event.newValue : 'system');
    };
    applyTheme(getPreference());
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // DAO routes have their own header control. Other agents can place the same
  // named control in their header; CSS hides this fallback when they do.
  return pathname.startsWith('/dao/') ? null : (
    <div className="warm-ink-theme-dock" aria-label="Display settings">
      <WarmInkThemeControl />
    </div>
  );
}
