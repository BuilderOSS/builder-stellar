import { css } from 'styled-system/css';

// Create, drafts and launch screens on Dusk tokens (formerly
// workspace.module.css). Native controls without a class pick up the system
// look; primitives (Button, Input, Field...) style themselves.
const nativeControls = {
  '& input:not([class]):not([type=checkbox]):not([type=radio]):not([type=file]), & select:not([class])': {
    width: '100%',
    minH: 'touch',
    px: '3.5',
    py: '2.5',
    bg: 'raised',
    color: 'ink',
    borderWidth: '1px',
    borderColor: 'rule',
    borderRadius: 'control',
    fontSize: '0.9375rem',
    _focusVisible: { outline: 'none', borderColor: 'signal', boxShadow: '0 0 0 3px token(colors.signal.wash)' }
  },
  '& button:not([class])': {
    minH: 'touch',
    px: '4',
    bg: 'raised',
    color: 'ink',
    borderWidth: '1px',
    borderColor: 'rule',
    borderRadius: 'control',
    fontWeight: '600',
    fontSize: '0.875rem',
    cursor: 'pointer',
    _hover: { bg: 'hover' },
    _disabled: { opacity: '0.5', cursor: 'not-allowed' },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
  }
} as const;

const styles = {
  workspace: css({ display: 'grid', gap: '6', maxW: '760px', color: 'ink', ...nativeControls }),
  header: css({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '4' }),
  actions: css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '2',
    pt: '2'
  }),
  steps: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    listStyle: 'none',
    p: '0',
    m: '0',
    gap: '1.5',
    '& button': {
      display: 'grid',
      gap: '2',
      width: '100%',
      p: '0',
      bg: 'transparent',
      border: '0',
      color: 'ink.muted',
      textStyle: 'label',
      textAlign: 'left',
      cursor: 'pointer',
      _before: { content: '""', display: 'block', height: '1', borderRadius: 'full', bg: 'hover' },
      '&[aria-current]': { color: 'ink', _before: { bg: 'signal' } },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '4px', borderRadius: 'sm' }
    }
  }),
  panel: css({
    display: 'grid',
    gap: '5',
    p: { base: '4', md: '6' },
    bg: 'surface',
    borderRadius: 'card',
    boxShadow: 'raised',
    ...nativeControls
  }),
  identity: css({
    display: 'grid',
    gridTemplateColumns: { base: 'minmax(0, 1fr) 112px', sm: 'minmax(0, 1fr) 136px' },
    gap: { base: '4', sm: '6' },
    alignItems: 'start'
  }),
  stack: css({ display: 'grid', gap: '5', minW: '0' }),
  field: css({ display: 'grid', gap: '1.5', minW: '0', '& label': { textStyle: 'label', color: 'ink' } }),
  label: css({ textStyle: 'label', color: 'ink' }),
  sectionTitle: css({ textStyle: 'heading', m: '0' }),
  muted: css({ textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', m: '0' }),
  error: css({ textStyle: 'caption', fontSize: '0.875rem', color: 'danger', fontWeight: '600', m: '0' }),
  image: css({
    position: 'relative',
    display: 'block',
    width: { base: '112px', sm: '136px' },
    height: { base: '112px', sm: '136px' },
    p: '0',
    overflow: 'hidden',
    bg: 'hover',
    borderRadius: 'card',
    outline: '1px solid',
    outlineColor: 'imageEdge',
    outlineOffset: '-1px',
    cursor: 'pointer',
    '& img': { width: '100%', height: '100%', objectFit: 'cover' },
    '& span': {
      position: 'absolute',
      insetX: '0',
      bottom: '0',
      py: '1.5',
      bg: 'scrim',
      color: 'white',
      textStyle: 'micro',
      textAlign: 'center'
    },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
  }),
  columns: css({ display: 'grid', gridTemplateColumns: { base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '5' }),
  choice: css({
    display: 'flex',
    gap: '3',
    alignItems: 'flex-start',
    minH: 'touch',
    py: '2',
    cursor: 'pointer',
    textStyle: 'body',
    '& input': { width: '4.5', height: '4.5', mt: '0.5', accentColor: 'var(--colors-primary)', flexShrink: '0' }
  }),
  group: css({ display: 'grid', gap: '4', pt: '5', borderTopWidth: '1px', borderColor: 'rule' }),
  summary: css({
    display: 'grid',
    m: '0',
    '& > div': {
      display: 'grid',
      gridTemplateColumns: { base: '1fr', sm: '160px minmax(0, 1fr)' },
      gap: { base: '0.5', sm: '3' },
      py: '3',
      borderBottomWidth: '1px',
      borderColor: 'rule',
      _last: { borderBottomWidth: '0' }
    },
    '& dt': { textStyle: 'caption', color: 'ink.muted' },
    '& dd': { m: '0', textStyle: 'body', overflowWrap: 'anywhere' }
  }),
  list: css({ display: 'grid', gap: '3' }),
  draft: css({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4',
    justifyContent: 'space-between',
    alignItems: 'center',
    p: '4',
    bg: 'surface',
    borderRadius: 'card',
    boxShadow: 'raised',
    '& h3': { textStyle: 'subheading', m: '0', mb: '1', overflowWrap: 'anywhere' }
  }),
  links: css({
    display: 'flex',
    gap: '3',
    alignItems: 'center',
    flexWrap: 'wrap',
    '& a:not([class])': {
      minH: 'touch',
      display: 'inline-flex',
      alignItems: 'center',
      color: 'signal',
      textStyle: 'label',
      textDecoration: 'none',
      _hover: { textDecoration: 'underline' }
    }
  }),
  canvas: css({
    width: 'min(100%, 260px)',
    aspectRatio: '1',
    borderRadius: 'card',
    bg: 'hover',
    outline: '1px solid',
    outlineColor: 'imageEdge',
    outlineOffset: '-1px'
  }),
  fieldset: css({ border: '0', p: '0', m: '0', minW: '0' }),
  code: css({ textStyle: 'mono', fontSize: '0.75rem', overflowWrap: 'anywhere', color: 'ink.muted' })
};

export default styles;
