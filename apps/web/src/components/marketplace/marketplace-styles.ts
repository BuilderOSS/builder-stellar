import { css } from 'styled-system/css';

// Marketplace screens share these Dusk-token styles (formerly a CSS module).
// Plain <button>, <input>, <select> and <label> inside `root`, `scoped` or
// `dialog` pick up the system look; buttons that set data-variant style
// themselves (primary, quiet).

const formControls = {
  '& label:not([class])': { display: 'flex', flexDirection: 'column', gap: '1.5', textStyle: 'label', color: 'ink' },
  '& input:not([type=checkbox]):not([class]), & select:not([class])': {
    width: '100%',
    minH: 'touch',
    px: '3.5',
    py: '2.5',
    bg: 'raised',
    color: 'ink',
    borderWidth: '1px',
    borderColor: 'rule',
    borderRadius: 'control',
    fontFamily: 'body',
    fontSize: '0.9375rem',
    fontWeight: '400',
    _focusVisible: { outline: 'none', borderColor: 'signal', boxShadow: '0 0 0 3px token(colors.signal.wash)' }
  },
  '& input:not([class])::placeholder': { color: 'ink.faint' },
  '& button:not([class])': {
    minH: 'touch',
    px: '4',
    py: '2.5',
    bg: 'raised',
    color: 'ink',
    borderWidth: '1px',
    borderColor: 'rule',
    borderRadius: 'control',
    fontFamily: 'body',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, scale',
    transitionDuration: 'press',
    transitionTimingFunction: 'out',
    _active: { scale: '0.96' },
    '@media (hover: hover) and (pointer: fine)': {
      '&:hover:not(:disabled)': { bg: 'hover', borderColor: 'rule.strong' }
    },
    '&[aria-pressed=true]': { color: 'signal', borderColor: 'signal.edge', bg: 'signal.wash' },
    _disabled: { opacity: '0.5', cursor: 'not-allowed', _active: { scale: '1' } },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
  },
  '& summary': {
    cursor: 'pointer',
    minH: 'touch',
    display: 'flex',
    alignItems: 'center',
    textStyle: 'label',
    color: 'ink.muted'
  }
} as const;

const styles = {
  root: css({ color: 'ink', ...formControls }),
  scoped: css({ color: 'ink', width: '100%', minW: '0', ...formControls }),
  dialog: css({
    color: 'ink',
    width: 'min(620px, calc(100vw - 32px))',
    maxH: 'calc(100dvh - 48px)',
    overflowY: 'auto',
    m: 'auto',
    p: { base: '5', md: '7' },
    border: '0',
    borderRadius: 'sheet',
    bg: 'surface',
    boxShadow: 'float',
    '&::backdrop': { bg: 'scrim' },
    '& h2': { textStyle: 'title', fontSize: '1.25rem', m: '0' },
    '& p': { m: '0' },
    ...formControls
  }),
  header: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4' }),
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
  description: css({
    color: 'ink.muted',
    textStyle: 'body',
    lineClamp: '3',
    minH: '4.5em'
  }),
  monogram: css({
    display: 'grid',
    placeItems: 'center',
    width: '12',
    height: '12',
    borderRadius: '12px',
    fontFamily: 'display',
    fontWeight: '700',
    fontSize: '1.25rem',
    color: 'signal',
    bg: 'signal.wash'
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
  filters: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
    gap: '3',
    alignItems: 'end'
  }),
  formGrid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: '4',
    alignItems: 'end'
  }),
  check: css({
    flexDirection: 'row!',
    alignItems: 'center',
    gap: '2.5',
    minH: 'touch',
    fontWeight: '400!',
    '& input': { width: '4.5', height: '4.5', accentColor: 'var(--colors-primary)' }
  }),
  primary: css({
    minH: 'touch',
    px: '4',
    py: '2.5',
    bg: 'primary',
    color: 'primary.fg',
    border: '0',
    borderRadius: 'control',
    fontFamily: 'body',
    fontSize: '0.9375rem',
    fontWeight: '600',
    cursor: 'pointer',
    transitionProperty: 'background-color, scale',
    transitionDuration: 'press',
    transitionTimingFunction: 'out',
    _active: { scale: '0.96' },
    '@media (hover: hover) and (pointer: fine)': { '&:hover:not(:disabled)': { bg: 'primary.hover' } },
    _disabled: { opacity: '0.5', cursor: 'not-allowed', _active: { scale: '1' } },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
  }),
  quiet: css({
    minH: 'touch',
    px: '3',
    bg: 'transparent',
    color: 'ink.muted',
    border: '0',
    borderRadius: 'control',
    fontWeight: '600',
    cursor: 'pointer',
    _hover: { bg: 'hover', color: 'ink' },
    _disabled: { opacity: '0.5', cursor: 'not-allowed' }
  }),
  button: css({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minH: 'touch',
    px: '4',
    py: '2.5',
    bg: 'raised',
    color: 'ink',
    borderWidth: '1px',
    borderColor: 'rule',
    borderRadius: 'control',
    fontWeight: '600',
    fontSize: '0.875rem',
    textDecoration: 'none',
    _hover: { bg: 'hover' },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
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
  }),
  empty: css({
    display: 'grid',
    gap: '2',
    py: '8',
    px: '4',
    textAlign: 'left',
    color: 'ink.muted',
    '& h2': { textStyle: 'subheading', color: 'ink', m: '0' }
  }),
  tableWrap: css({ overflowX: 'auto' })
};

export default styles;
