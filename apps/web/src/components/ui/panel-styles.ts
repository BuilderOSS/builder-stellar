import { css } from 'styled-system/css';

// One column that may shrink below its content's widest word (a full Stellar address), so a long
// review line wraps instead of widening the page (BUG-W11-2).
export const card = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '4',
  p: '5',
  borderRadius: 'card',
  bg: 'surface',
  boxShadow: 'raised'
});
export const title = css({ textStyle: 'heading', m: '0' });
export const muted = css({ textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', m: '0', mt: '1' });
export const fields = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: { base: '1fr', sm: '120px minmax(0, 1fr)' }
});
export const facts = css({ display: 'grid', gap: '2', p: '3.5', borderRadius: 'control', bg: 'hover' });
export const fact = css({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '3' });
export const review = css({
  display: 'grid',
  gap: '3',
  p: '4',
  borderRadius: 'control',
  gridTemplateColumns: 'minmax(0, 1fr)',
  boxShadow: 'inset 0 0 0 1px token(colors.signal.edge)'
});
export const reviewTitle = css({ textStyle: 'subheading', m: '0', overflowWrap: 'anywhere' });
