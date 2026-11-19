import { css } from 'styled-system/css';

// The docs body (decision 4A): 17px Figtree at line-height 1.6, a 68ch measure. Headings
// take more space above than below. Links are the browser-surface style (decision 5A):
// `signal`, a 1px underline at 0.2em, and visited mixed 70/30 with `ink.muted`.

export const proseLink = css({
  color: 'signal',
  textDecorationLine: 'underline',
  textDecorationThickness: '1px',
  textUnderlineOffset: '0.2em',
  _visited: { color: 'color-mix(in srgb, token(colors.signal) 70%, token(colors.ink.muted))' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { textDecorationThickness: '2px' } }
});

export const prose = css({
  fontFamily: 'body',
  fontSize: '1.0625rem',
  lineHeight: '1.6',
  color: 'ink',
  maxW: '68ch',
  overflowWrap: 'break-word'
});

export const proseH2 = css({ textStyle: 'title', color: 'ink', mt: '12', mb: '3', scrollMarginTop: '28' });
export const proseH3 = css({ textStyle: 'heading', color: 'ink', mt: '8', mb: '2', scrollMarginTop: '28' });
export const proseP = css({ m: '0', mb: '4' });
export const proseList = css({ m: '0', mb: '4', pl: '6', '& li': { mb: '1.5' } });
export const proseCode = css({
  fontFamily: 'mono',
  fontSize: '0.875em',
  bg: 'hover',
  px: '1',
  py: '0.5',
  borderRadius: 'sm'
});
export const prosePre = css({
  fontFamily: 'mono',
  fontSize: '0.875rem',
  lineHeight: '1.6',
  bg: 'surface',
  p: '4',
  mb: '4',
  borderRadius: 'card',
  overflowX: 'auto',
  '& code': { bg: 'transparent', p: '0', fontSize: 'inherit' }
});
