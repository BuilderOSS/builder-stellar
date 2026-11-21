import { ArrowUpRight } from 'lucide-react';
import { css } from 'styled-system/css';

import { docsHref } from '@/lib/site';

const link = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  color: 'signal',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  '& svg': { width: '3.5', height: '3.5' },
  _hover: { textDecoration: 'underline' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' }
});

/** "Read the guide", to a page on docs.tribes.build (a docs path such as `guides/marketplace/sell`). */
export function GuideLink({ path, label = 'Read the guide' }: { path: string; label?: string }) {
  return (
    <a className={link} href={docsHref(path)} target="_blank" rel="noopener noreferrer">
      {label}
      <ArrowUpRight aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
