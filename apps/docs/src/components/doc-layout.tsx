import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { DocsNav } from '@/components/docs-nav';
import { TocAside, TocInline } from '@/components/toc';
import type { TocEntry } from '@/lib/toc';

// Desktop (xl, 1280px and up): nav, content and an on-page table of contents.
// Tablet (md to xl): nav and content; the contents fold into a Disclosure at the top.
// Mobile: one column; the nav is in the header's sheet, with a sticky "On this page" control.
const shell = css({
  display: 'grid',
  gridTemplateColumns: {
    base: 'minmax(0, 1fr)',
    md: '232px minmax(0, 1fr)',
    xl: '248px minmax(0, 1fr) 216px'
  },
  gap: { base: '0', md: '8', xl: '10' },
  maxW: '1440px',
  mx: 'auto',
  px: { base: '4', md: '6' }
});
const sidebar = css({
  display: { base: 'none', md: 'block' },
  position: 'sticky',
  top: '16',
  alignSelf: 'start',
  maxH: 'calc(100dvh - 64px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  py: '6',
  pr: '1'
});
const main = css({ minW: '0', py: { base: '0', md: '8' }, pb: '16', outline: 'none' });

export function DocLayout({ toc, children }: { toc: TocEntry[]; children: ReactNode }) {
  return (
    <div className={shell}>
      <div className={sidebar} data-pagefind-ignore>
        <DocsNav />
      </div>
      <main id="content" tabIndex={-1} className={main}>
        <TocInline entries={toc} />
        {children}
      </main>
      <TocAside entries={toc} />
    </div>
  );
}
