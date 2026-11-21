// Theme preference shared by tribes.build and docs.tribes.build.
//
// localStorage is per origin, so the docs can't read what the app stored. Both sites
// also write a `tribes-theme` cookie on `.tribes.build`, and both read it first. The
// app's localStorage key stays as the fallback (and the only store on other hosts,
// such as localhost and Vercel previews, where the cookie is host-only).

export const THEME_STORAGE_KEY = 'builder.warm-ink.theme.v1';
export const THEME_COOKIE = 'tribes-theme';
export const THEME_COOKIE_DOMAIN = 'tribes.build';
/** Fired on window after every apply, for useSyncExternalStore subscribers. */
export const THEME_EVENT = 'builder:warm-ink-theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Reads the cookie value from a `document.cookie` string. */
export function readThemeCookie(cookie: string | undefined): ThemePreference | null {
  const match = (cookie ?? '').match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  const value = match?.[1];
  return isThemePreference(value) ? value : null;
}

/**
 * The cookie string to write. On tribes.build and its subdomains it is scoped to
 * `.tribes.build` so both sites share it; elsewhere it stays host-only.
 */
export function themeCookie(preference: ThemePreference, hostname: string, secure: boolean): string {
  const shared = hostname === THEME_COOKIE_DOMAIN || hostname.endsWith(`.${THEME_COOKIE_DOMAIN}`);
  return [
    `${THEME_COOKIE}=${preference}`,
    'path=/',
    'max-age=31536000',
    'samesite=lax',
    shared ? `domain=.${THEME_COOKIE_DOMAIN}` : null,
    secure ? 'secure' : null
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Runs in <head>, before the first body paint: cookie, then localStorage, then the
 * site's default. Storage and cookies can be denied in private browsing; the default
 * must still resolve then.
 */
export function themeBootScript(defaultPreference: ThemePreference): string {
  return `(()=>{const ok=(v)=>v==='light'||v==='dark'||v==='system';let p='${defaultPreference}';try{const s=localStorage.getItem('${THEME_STORAGE_KEY}');if(ok(s))p=s}catch{}try{const m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);if(m&&ok(m[1]))p=m[1]}catch{}const r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p})()`;
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

/** The preference the boot script put on <html>, or the default before it ran. */
export function currentThemePreference(defaultPreference: ThemePreference): ThemePreference {
  const preference = document.documentElement.dataset.themePreference;
  return isThemePreference(preference) ? preference : defaultPreference;
}

/** Sets [data-theme] with transitions suppressed for the frame (globals: [data-theme-switching]). */
export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  const resolved = resolveTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches);
  const changed = root.dataset.theme !== resolved;
  if (changed) root.setAttribute('data-theme-switching', '');
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  if (changed) {
    // Flush the new colours with transitions suppressed, then restore motion.
    void root.offsetHeight;
    requestAnimationFrame(() => root.removeAttribute('data-theme-switching'));
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Saves to both stores and applies. Either store may be denied; the in-memory theme still works. */
export function saveThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* Storage denied. */
  }
  try {
    document.cookie = themeCookie(preference, window.location.hostname, window.location.protocol === 'https:');
  } catch {
    /* Cookies denied. */
  }
  applyThemePreference(preference);
}
