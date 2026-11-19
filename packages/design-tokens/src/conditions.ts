// The boot script sets [data-theme] on <html> before first paint, so `_dark` and
// `_light` follow the reader's choice rather than only the OS preference.
export const conditions = {
  dark: '[data-theme=dark] &',
  light: '[data-theme=light] &'
} as const;

export const breakpoints = { sm: '480px' } as const;
