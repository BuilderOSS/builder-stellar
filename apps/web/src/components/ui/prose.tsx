import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

const prose = css({
  maxW: '68ch',
  color: 'ink',
  textStyle: 'body',
  '& h1': { textStyle: 'title', fontSize: { base: '1.75rem', md: '2rem' }, m: '0', mb: '2' },
  '& h1 + p': { textStyle: 'caption', color: 'ink.muted', mb: '8' },
  '& h2': { textStyle: 'heading', fontSize: '1.125rem', mt: '8', mb: '3' },
  '& h3': { textStyle: 'subheading', mt: '6', mb: '2' },
  '& p': { m: '0', mb: '3', color: 'ink.muted', lineHeight: '1.65' },
  '& ul, & ol': { m: '0', mb: '3', pl: '5', color: 'ink.muted', lineHeight: '1.65' },
  '& li': { mb: '1.5' },
  '& strong': { color: 'ink', fontWeight: '600' },
  '& a': { color: 'signal', textDecoration: 'underline', textUnderlineOffset: '3px' },
  '& section': { m: '0' }
});

/** Long-form text (legal pages, help). Styles plain HTML children. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cx(prose, className)}>{children}</article>;
}
