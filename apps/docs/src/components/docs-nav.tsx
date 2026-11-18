'use client';

import { Disclosure } from '@builder-stellar/web/ui/disclosure';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { css, cx } from 'styled-system/css';

import { type DocPage, NAV, pageHref } from '@/lib/nav';

const GUIDE_AREAS: Record<string, string> = {
  create: 'Create a tribe',
  setup: 'Set up and launch',
  proposals: 'Proposals',
  auctions: 'Auctions',
  marketplace: 'Marketplace',
  claims: 'Claims',
  members: 'Members',
  manage: 'Manage',
  legal: 'Legal entity export',
  platform: 'Running the platform'
};

const list = css({ listStyle: 'none', m: '0', p: '0', display: 'grid', gap: '0.5' });
const groupLabel = css({ textStyle: 'micro', color: 'ink.muted', m: '0', pt: '3', pb: '1', px: '3' });
const link = css({
  display: 'flex',
  alignItems: 'center',
  minH: '8',
  px: '3',
  py: '1',
  borderRadius: 'control',
  textStyle: 'body',
  color: 'ink.muted',
  textDecoration: 'none',
  transitionProperty: 'background-color, color, scale',
  transitionDuration: 'fast',
  transitionTimingFunction: 'out',
  _active: { scale: '0.96' },
  '@media (pointer: coarse)': { minH: 'touch' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', color: 'ink' } },
  '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } },
  // `ink` on the wash: `signal` text on its own wash misses AA in the dark theme.
  '&[aria-current=page]': { bg: 'signal.wash', color: 'ink', fontWeight: '600' }
});

/** Strips trailing slashes so /guides/vote/ and /guides/vote match the slug. */
export function slugFromPath(pathname: string | null): string {
  return (pathname ?? '/').replace(/^\/+|\/+$/g, '');
}

function PageLinks({ pages, current, onNavigate }: { pages: DocPage[]; current: string; onNavigate?: () => void }) {
  return (
    <ul className={list}>
      {pages.map((page) => (
        <li key={page.slug}>
          <NextLink
            href={pageHref(page.slug)}
            className={link}
            aria-current={page.slug === current ? 'page' : undefined}
            onClick={onNavigate}
          >
            {page.title}
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * The docs navigation, used by the sidebar and the mobile nav sheet. The current
 * section opens; the current page has aria-current="page".
 */
export function DocsNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const current = slugFromPath(usePathname());
  const currentSection = NAV.find((section) => section.pages.some((page) => page.slug === current))?.id ?? 'start';
  const ref = useRef<HTMLElement>(null);

  // Bring the current page into view inside the sidebar or sheet, never by scrolling the window.
  useEffect(() => {
    const link = ref.current?.querySelector<HTMLElement>('[aria-current=page]');
    let scroller = link?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!link || !scroller || scroller === document.documentElement) return;
    const offset = link.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (offset < 0 || offset > scroller.clientHeight - link.offsetHeight) {
      scroller.scrollTop += offset - scroller.clientHeight / 3;
    }
  }, [current]);

  return (
    <nav ref={ref} aria-label="Docs" className={cx(css({ display: 'grid' }), className)}>
      {NAV.map((section) => {
        if (section.id !== 'guides') {
          return (
            <Disclosure key={section.id} title={section.title} defaultOpen={section.id === currentSection}>
              <PageLinks pages={section.pages} current={current} onNavigate={onNavigate} />
            </Disclosure>
          );
        }
        const areas = Object.keys(GUIDE_AREAS);
        return (
          <Disclosure key={section.id} title={section.title} defaultOpen={section.id === currentSection}>
            <div className={css({ display: 'grid' })}>
              {areas.map((area) => {
                const pages = section.pages.filter((page) => page.slug.startsWith(`guides/${area}/`));
                return (
                  <div key={area}>
                    <p className={groupLabel}>{GUIDE_AREAS[area]}</p>
                    <PageLinks pages={pages} current={current} onNavigate={onNavigate} />
                  </div>
                );
              })}
            </div>
          </Disclosure>
        );
      })}
    </nav>
  );
}

export { GUIDE_AREAS };
