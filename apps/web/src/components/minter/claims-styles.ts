import { css } from 'styled-system/css';

// Claims screens on Dusk tokens. Controls come from components/ui; bare links pick up the signal colour.
const controls = {
  '& a:not([class])': { color: 'signal', textStyle: 'label' }
} as const;

const styles = {
  surface: css({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '6', ...controls }),
  panel: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    minW: '0',
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
