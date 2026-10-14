// Colours for images drawn outside the page (next/og icons and share cards), which can't read
// Panda tokens. They mirror DESIGN.md: the Brand and Logo section and the dark theme column.

export const PAPER = '#F3EDE5';
export const PAPER_MUTED = '#B3ABA1';
export const BRASS = '#D9A35A';
/** The Dusk gradient, top to bottom; the middle stop sits at 60%. */
export const DUSK = ['#10213F', '#143F86', '#2F6FD1'] as const;

/** Status colours on Dusk: the dark-theme signal, success, warning and error values. */
export const STATUS = {
  live: '#0085FF',
  success: '#4FBA8B',
  warning: '#E2A94F',
  danger: '#EF7B87',
  neutral: '#B3ABA1'
} as const;
export type StatusTone = keyof typeof STATUS;
