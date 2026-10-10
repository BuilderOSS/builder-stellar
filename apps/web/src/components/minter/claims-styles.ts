import { css } from 'styled-system/css';

// Claims screens on Dusk tokens (formerly claims.module.css). Native
// controls without a class pick up the system look.
const controls = {
  '& label:not([class])': { display: 'grid', gap: '1.5', textStyle: 'label', color: 'ink' },
  '& textarea:not([class])': {
    width: '100%',
    minH: '36',
    p: '3',
    bg: 'raised',
    color: 'ink',
    borderWidth: '1px',
    borderColor: 'rule',
    borderRadius: 'control',
    textStyle: 'mono',
    _focusVisible: { outline: 'none', borderColor: 'signal', boxShadow: '0 0 0 3px token(colors.signal.wash)' }
  },
  '& input[type=file]': { textStyle: 'caption', color: 'ink.muted' },
  '& button:not([class])': {
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
    cursor: 'pointer',
    transitionProperty: 'background-color, scale',
    transitionDuration: 'press',
    transitionTimingFunction: 'out',
    _active: { scale: '0.96' },
    '@media (hover: hover) and (pointer: fine)': { '&:hover:not(:disabled)': { bg: 'hover' } },
    _disabled: { opacity: '0.5', cursor: 'not-allowed', _active: { scale: '1' } },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
  },
  '& a:not([class])': { color: 'signal', textStyle: 'label' }
} as const;

const styles = {
  surface: css({ display: 'grid', gap: '6', ...controls }),
  panel: css({
    display: 'grid',
    alignContent: 'start',
    gap: '3',
    p: { base: '4', md: '6' },
    bg: 'surface',
    borderRadius: 'card',
    boxShadow: 'raised',
    color: 'ink',
    '& h1': { textStyle: 'title', fontSize: { base: '1.625rem', md: '2rem' }, m: '0' },
    '& h2': { textStyle: 'heading', m: '0' },
    '& p': { m: '0', textStyle: 'body', color: 'ink.muted' },
    ...controls
  }),
  grid: css({
    alignItems: 'start',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))',
    gap: '4'
  }),
  row: css({ display: 'flex', flexWrap: 'wrap', gap: '3', alignItems: 'center' }),
  address: css({ overflowWrap: 'anywhere', textStyle: 'mono', fontSize: '0.75rem', color: 'ink.muted!' }),
  muted: css({ textStyle: 'caption', color: 'ink.muted' }),
  review: css({
    display: 'grid',
    gap: '3',
    p: '4',
    borderRadius: 'card',
    boxShadow: 'inset 0 0 0 1px token(colors.signal.edge)!'
  }),
  history: css({
    display: 'grid',
    listStyle: 'none',
    m: '0',
    p: '0',
    '& li': { py: '3', borderBottomWidth: '1px', borderColor: 'rule', _last: { borderBottomWidth: '0' } }
  })
};

export default styles;
