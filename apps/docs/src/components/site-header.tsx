'use client';

import { BrandMark, BrandWordmark } from '@builder-stellar/web/brand-mark';
import { IconButton } from '@builder-stellar/web/ui/button';
import { Sheet } from '@builder-stellar/web/ui/sheet';
import { Menu, Search } from 'lucide-react';
import NextLink from 'next/link';
import { useRef, useState, useSyncExternalStore } from 'react';
import { css } from 'styled-system/css';

import { DocsNav } from '@/components/docs-nav';
import { SearchDialog } from '@/components/search-dialog';
import { ThemeControl } from '@/components/theme';
import { openSearch } from '@/lib/site';

const header = css({
  position: 'sticky',
  top: '0',
  zIndex: 'bar',
  bg: 'canvas',
  borderBottomWidth: '1px',
  borderColor: 'rule'
});
const inner = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  minH: '16',
  px: { base: '4', md: '6' },
  maxW: '1440px',
  mx: 'auto'
});
const lockup = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2.5',
  minH: 'touch',
  color: 'ink',
  textDecoration: 'none',
  fontFamily: 'display',
  fontWeight: '700',
  fontSize: '1.0625rem',
  letterSpacing: '-0.01em',
  whiteSpace: 'nowrap',
  borderRadius: 'control'
});
const docsWord = css({ fontWeight: '500', color: 'ink.muted' });
const spacer = css({ flex: '1' });
const searchButton = css({
  display: { base: 'none', md: 'inline-flex' },
  alignItems: 'center',
  gap: '2',
  minH: 'touch',
  minW: '56',
  px: '3',
  borderWidth: '1px',
  borderColor: 'rule',
  borderRadius: 'control',
  bg: 'raised',
  color: 'ink.muted',
  textStyle: 'body',
  cursor: 'pointer',
  transitionProperty: 'border-color, scale',
  transitionDuration: 'press',
  transitionTimingFunction: 'out',
  _active: { scale: '0.96' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { borderColor: 'rule.strong' } },
  '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } },
  '& svg': { width: '4', height: '4', flexShrink: '0' }
});
const kbd = css({
  ml: 'auto',
  fontFamily: 'mono',
  fontSize: '0.75rem',
  color: 'ink.muted',
  px: '1.5',
  borderRadius: 'sm',
  borderWidth: '1px',
  borderColor: 'rule'
});
const mobileOnly = css({ display: { base: 'inline-flex', md: 'none' } });
const desktopOnly = css({ display: { base: 'none', md: 'block' } });
const sheetTheme = css({ display: 'grid', gap: '2', pt: '4', mt: '2', borderTopWidth: '1px', borderColor: 'rule' });
const sheetLabel = css({ textStyle: 'label', color: 'ink.muted', m: '0' });

const noSubscribe = () => () => {};
const shortcutLabel = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K');

export function SiteHeader() {
  const [navOpen, setNavOpen] = useState(false);
  const shortcut = useSyncExternalStore(noSubscribe, shortcutLabel, () => 'Ctrl K');
  const desktopTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  const search = (trigger: HTMLButtonElement | null) => {
    lastTrigger.current = trigger;
    openSearch();
  };

  return (
    <header className={header}>
      <div className={inner}>
        <NextLink href="/" className={lockup} aria-label="Tribe Builder Docs, home">
          <BrandMark size={28} />
          <span aria-hidden="true">
            <BrandWordmark /> <span className={docsWord}>Docs</span>
          </span>
        </NextLink>
        <span className={spacer} />
        <button
          ref={desktopTrigger}
          type="button"
          className={searchButton}
          onClick={() => search(desktopTrigger.current)}
          aria-keyshortcuts="Meta+K Control+K /"
        >
          <Search aria-hidden="true" />
          Search
          <kbd className={kbd} aria-hidden="true">
            {shortcut}
          </kbd>
        </button>
        <div className={desktopOnly}>
          <ThemeControl id="theme-header" />
        </div>
        <span className={mobileOnly}>
          <IconButton ref={mobileTrigger} label="Search" onClick={() => search(mobileTrigger.current)}>
            <Search aria-hidden="true" />
          </IconButton>
        </span>
        <span className={mobileOnly}>
          <Sheet
            open={navOpen}
            onOpenChange={setNavOpen}
            title="Docs"
            hideTitle
            trigger={
              <IconButton label="Menu">
                <Menu aria-hidden="true" />
              </IconButton>
            }
          >
            <DocsNav onNavigate={() => setNavOpen(false)} />
            <div className={sheetTheme}>
              <p className={sheetLabel}>Appearance</p>
              <ThemeControl id="theme-sheet" fill />
            </div>
          </Sheet>
        </span>
      </div>
      <SearchDialog
        finalFocusEl={() =>
          // A shortcut has no trigger of its own: focus returns to whichever search button is on screen.
          lastTrigger.current ?? (desktopTrigger.current?.offsetParent ? desktopTrigger.current : mobileTrigger.current)
        }
      />
    </header>
  );
}
