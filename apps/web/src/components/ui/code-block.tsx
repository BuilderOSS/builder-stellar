import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

const block = css({
  m: '0',
  p: '3',
  borderRadius: 'control',
  bg: 'hover',
  color: 'ink',
  textStyle: 'mono',
  fontSize: '0.75rem',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  maxH: '80',
  overflowY: 'auto'
});

/** Raw data shown for verification (JSON, call arguments, hashes). */
export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <pre className={cx(block, className)}>{children}</pre>;
}
