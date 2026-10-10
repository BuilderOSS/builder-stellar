export const WARM_INK_THEME_KEY = 'builder.warm-ink.theme.v1';
export type WarmInkPreference = 'light' | 'dark' | 'system';

export function isWarmInkPreference(value: unknown): value is WarmInkPreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Runs in <head>, before the first body paint. Storage can be denied in private
// browsing; resolving the OS preference must still work in that case.
export const warmInkBootScript = `(()=>{let p='system';try{const s=localStorage.getItem('${WARM_INK_THEME_KEY}');if(s==='light'||s==='dark'||s==='system')p=s}catch{}const r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p})()`;
