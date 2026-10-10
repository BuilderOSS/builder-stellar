import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { NetworkBanner } from './network-banner';

const root = css({
  display: 'grid',
  minH: '100dvh',
  gridTemplateColumns: { base: 'minmax(0, 1fr)', md: 'auto minmax(0, 1fr)' }
});
const column = css({ display: 'flex', flexDirection: 'column', minW: '0' });
const topBar = css({
  position: 'sticky',
  top: '0',
  zIndex: 'bar',
  display: 'flex',
  minH: '60px',
  pt: 'env(safe-area-inset-top)',
  // One translucent layer, where it explains that content scrolls beneath.
  bg: 'color-mix(in srgb, token(colors.canvas) 88%, transparent)',
  backdropFilter: 'blur(12px)'
});
// The bar's background spans the window; its controls line up with the content column below.
const topInner = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  width: '100%',
  maxW: 'content',
  mx: 'auto',
  px: 'clamp(16px, 4vw, 40px)'
});
const topStart = css({ display: 'flex', alignItems: 'center', gap: '2', minW: '0', flex: '1' });
const topEnd = css({ display: 'flex', alignItems: 'center', gap: '2', flexShrink: '0' });
const content = css({
  width: '100%',
  maxW: 'content',
  mx: 'auto',
  px: 'clamp(16px, 4vw, 40px)',
  pt: { base: '3', md: '6' },
  // Clear the tab bar and a page action bar on phones.
  pb: { base: 'calc(token(sizes.tabbar) + env(safe-area-inset-bottom) + 96px)', md: '16' },
  flex: '1',
  outline: 'none'
});
const skip = css({
  position: 'fixed',
  zIndex: 'toast',
  top: '3',
  left: '3',
  px: '3.5',
  py: '2.5',
  borderRadius: 'control',
  bg: 'ink',
  color: 'canvas',
  fontWeight: '700',
  translate: '0 -160%',
  transitionProperty: 'translate',
  transitionDuration: 'pop',
  _focus: { translate: '0 0' }
});

/**
 * The app frame: optional left rail (md+), sticky top bar, content column and
 * a phone tab bar. Both the global and community shells render through it.
 */
export function ShellFrame({
  rail,
  topStart: start,
  topEnd: end,
  tabBar,
  overlays,
  children
}: {
  rail?: ReactNode;
  topStart: ReactNode;
  topEnd: ReactNode;
  tabBar: ReactNode;
  overlays?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={root}>
      <a className={skip} href="#main-content">
        Skip to content
      </a>
      {rail}
      <div className={column}>
        <header className={topBar}>
          <div className={topInner}>
            <div className={topStart}>{start}</div>
            <div className={topEnd}>{end}</div>
          </div>
        </header>
        <main id="main-content" className={content} tabIndex={-1}>
          <NetworkBanner />
          {children}
        </main>
      </div>
      {tabBar}
      {overlays}
    </div>
  );
}
