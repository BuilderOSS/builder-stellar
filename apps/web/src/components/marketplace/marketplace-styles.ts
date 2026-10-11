import { css } from 'styled-system/css';

// Marketplace screens share these Dusk-token layout styles. Controls come from components/ui.

const styles = {
  root: css({ color: 'ink' }),
  scoped: css({ color: 'ink', width: '100%', minW: '0' }),
  stack: css({ display: 'flex', flexDirection: 'column', gap: '5' }),
  row: css({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3', justifyContent: 'space-between' }),
  hero: css({
    maxW: '840px',
    '& h1': { textStyle: 'display', fontSize: { base: '2rem', md: '2.75rem' }, m: '0', mb: '3' },
    '& p': { textStyle: 'body', fontSize: '1.0625rem', color: 'ink.muted', maxW: '62ch', m: '0' }
  }),
  eyebrow: css({ textStyle: 'label', color: 'ink.muted', m: '0' }),
  grid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
    gap: '4',
    alignItems: 'start'
  }),
  card: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '3.5',
    p: '4',
    minW: '0',
    bg: 'surface',
    borderRadius: 'card',
    boxShadow: 'raised',
    '& h2, & h3': { textStyle: 'heading', fontSize: '1.125rem', m: '0' },
    '& p': { m: '0' }
  }),
  panel: css({
    p: { base: '4', md: '6' },
    minW: '0',
    bg: 'surface',
    borderRadius: 'card',
    boxShadow: 'raised',
    '& h2': { textStyle: 'heading', m: '0' },
    '& table': { width: '100%', borderCollapse: 'collapse', textStyle: 'caption', whiteSpace: 'nowrap' },
    '& th, & td': { py: '3', px: '3', textAlign: 'left', borderBottomWidth: '1px', borderColor: 'rule' },
    '& th': { color: 'ink.muted', fontWeight: '600' }
  }),
  chip: css({
    display: 'inline-flex',
    alignItems: 'center',
    px: '2.5',
    py: '0.5',
    minH: '6',
    borderRadius: 'full',
    bg: 'hover',
    color: 'ink.muted',
    textStyle: 'micro'
  }),
  status: css({ textStyle: 'caption', color: 'ink.muted', textTransform: 'capitalize' }),
  muted: css({ textStyle: 'caption', color: 'ink.muted' }),
  tokenArt: css({
    display: 'grid',
    placeItems: 'center',
    aspectRatio: '1',
    bg: 'hover',
    borderRadius: 'control',
    overflow: 'hidden',
    fontFamily: 'display',
    fontWeight: '700',
    fontSize: '2.5rem',
    color: 'ink.faint',
    outline: '1px solid',
    outlineColor: 'imageEdge',
    outlineOffset: '-1px',
    '& img': { width: '100%', height: '100%', objectFit: 'cover' }
  }),
  price: css({
    textStyle: 'title',
    fontSize: '1.375rem',
    fontVariantNumeric: 'tabular-nums',
    overflowWrap: 'anywhere',
    '& span': { textStyle: 'label', color: 'ink.muted', ml: '1' }
  }),
  formGrid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: '4',
    alignItems: 'end'
  }),
  notice: css({
    display: 'grid',
    gap: '2.5',
    p: '4',
    borderRadius: 'control',
    bg: 'hover',
    '& p': { m: '0' }
  }),
  address: css({ overflowWrap: 'anywhere', textStyle: 'mono', fontSize: '0.75rem', color: 'ink.muted' }),
  details: css({
    display: 'grid',
    gap: '1',
    textStyle: 'caption',
    m: '0',
    '& dt': { color: 'ink.muted', mt: '2' },
    '& dd': { m: '0', color: 'ink' }
  })
};

export default styles;
