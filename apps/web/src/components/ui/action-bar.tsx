import type { ReactNode } from 'react';
import { cva } from 'styled-system/css';

const bar = cva({
  base: {
    display: 'flex',
    gap: '2',
    '& > *': { flex: '1' }
  },
  variants: {
    mobileOnly: {
      true: {
        position: 'fixed',
        zIndex: 'bar',
        left: '3',
        right: '3',
        // Sits above the tab bar and the iOS home indicator.
        bottom: 'calc(token(sizes.tabbar) + env(safe-area-inset-bottom) + 12px)',
        p: '2',
        bg: 'surface',
        borderRadius: 'card',
        boxShadow: 'float',
        md: { display: 'none' }
      },
      false: {
        position: { base: 'sticky', md: 'static' },
        bottom: { base: 'calc(token(sizes.tabbar) + env(safe-area-inset-bottom) + 12px)', md: 'auto' },
        zIndex: 'bar',
        p: { base: '2', md: '0' },
        bg: { base: 'surface', md: 'transparent' },
        borderRadius: 'card',
        boxShadow: { base: 'float', md: 'none' },
        md: { '& > *': { flex: '0 0 auto' } }
      }
    }
  },
  defaultVariants: { mobileOnly: false }
});

/**
 * Where a screen's primary action lives on phones: a floating bar above the
 * tab bar, always reachable by thumb. Pages that use it get bottom padding
 * from the shell (`data-has-action-bar`).
 */
export function ActionBar({ children, mobileOnly }: { children: ReactNode; mobileOnly?: boolean }) {
  return (
    <div className={bar({ mobileOnly })} data-action-bar="">
      {children}
    </div>
  );
}
