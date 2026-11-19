'use client';

import { Button } from '@builder-stellar/web/ui/button';
import { Disclosure } from '@builder-stellar/web/ui/disclosure';
import { Sheet } from '@builder-stellar/web/ui/sheet';
import { ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';
import { css, cx } from 'styled-system/css';

import type { TocEntry } from '@/lib/toc';

const list = css({ listStyle: 'none', m: '0', p: '0', display: 'grid', gap: '0.5' });
const link = css({
  display: 'flex',
  alignItems: 'center',
  minH: '8',
  py: '1',
  color: 'ink.muted',
  textStyle: 'caption',
  fontSize: '0.875rem',
  textDecoration: 'none',
  borderRadius: 'sm',
  '@media (pointer: coarse)': { minH: 'touch' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { color: 'ink' } },
  '&[data-active]': { color: 'signal', fontWeight: '600' }
});
const nested = css({ pl: '3' });
const heading = css({ textStyle: 'label', color: 'ink', m: '0', mb: '2' });

/** Marks the heading nearest the top of the viewport as you read. */
function useActiveHeading(entries: TocEntry[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const targets = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((node): node is HTMLElement => node !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.filter((record) => record.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [entries]);
  return active;
}

function TocList({ entries, onNavigate }: { entries: TocEntry[]; onNavigate?: () => void }) {
  const active = useActiveHeading(entries);
  return (
    <ul className={list}>
      {entries.map((entry) => (
        <li key={entry.id} className={entry.depth === 3 ? nested : undefined}>
          <a
            href={`#${entry.id}`}
            className={link}
            data-active={entry.id === active ? '' : undefined}
            aria-current={entry.id === active ? 'location' : undefined}
            onClick={onNavigate}
          >
            {entry.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

const asideDesktop = css({
  display: { base: 'none', xl: 'block' },
  position: 'sticky',
  top: '24',
  alignSelf: 'start',
  maxH: 'calc(100dvh - 120px)',
  overflowY: 'auto',
  py: '2'
});
const asideTablet = css({ display: { base: 'none', md: 'block', xl: 'none' }, mb: '6' });
const mobileBar = css({
  display: { base: 'flex', md: 'none' },
  position: 'sticky',
  top: '16',
  zIndex: 'bar',
  mx: '-4',
  px: '4',
  py: '1',
  mb: '4',
  bg: 'canvas',
  borderBottomWidth: '1px',
  borderColor: 'rule'
});

/** Desktop: its own column. */
export function TocAside({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <aside aria-label="On this page" className={asideDesktop} data-pagefind-ignore>
      <p className={heading}>On this page</p>
      <TocList entries={entries} />
    </aside>
  );
}

/** Tablet: folded into a Disclosure above the content. Mobile: a sticky control that opens a sheet. */
export function TocInline({ entries }: { entries: TocEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <>
      <aside aria-label="On this page" className={asideTablet} data-pagefind-ignore>
        <Disclosure title="On this page">
          <TocList entries={entries} />
        </Disclosure>
      </aside>
      <div className={cx(mobileBar)} data-pagefind-ignore>
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title="On this page"
          trigger={
            <Button variant="ghost" size="sm">
              <ListTree aria-hidden="true" />
              On this page
            </Button>
          }
        >
          <aside aria-label="On this page">
            <TocList entries={entries} onNavigate={() => setOpen(false)} />
          </aside>
        </Sheet>
      </div>
    </>
  );
}
