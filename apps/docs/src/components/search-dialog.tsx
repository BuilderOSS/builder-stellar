'use client';

import { Dialog } from '@builder-stellar/web/ui/dialog';
import { SearchInput } from '@builder-stellar/web/ui/search-input';
import type { Route } from 'next';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';

import { findPage, pageHref, POPULAR } from '@/lib/nav';
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from '@/lib/site';

type PagefindResultData = { url: string; excerpt: string; meta: { title?: string } };
type Pagefind = {
  init?: () => Promise<void>;
  search: (query: string) => Promise<{ results: Array<{ id: string; data: () => Promise<PagefindResultData> }> }>;
};

export type SearchHit = { id: string; url: string; title: string; excerpt: string };
type IndexState = 'idle' | 'ready' | 'unavailable';

// Built by `pagefind --site out` after `next build` (see docs/DOCS_SITE.md). In `next dev` it
// exists only after `pnpm --dir apps/docs search:dev`; until then search shows its error state.
const PAGEFIND_URL = '/pagefind/pagefind.js';
let pagefindPromise: Promise<Pagefind> | null = null;

function loadPagefind(): Promise<Pagefind> {
  pagefindPromise ??= import(/* webpackIgnore: true */ PAGEFIND_URL).then(async (module: Pagefind) => {
    await module.init?.();
    return module;
  });
  pagefindPromise.catch(() => {
    pagefindPromise = null;
  });
  return pagefindPromise;
}

const MAX_RESULTS = 8;

const listbox = css({ listStyle: 'none', m: '0', p: '0', display: 'grid', gap: '1' });
const option = css({
  display: 'grid',
  gap: '0.5',
  px: '3',
  py: '2.5',
  minH: 'touch',
  borderRadius: 'control',
  cursor: 'pointer',
  '&[aria-selected=true]': { bg: 'signal.wash' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } }
});
const optionTitle = css({ textStyle: 'label', fontSize: '0.9375rem', color: 'ink' });
const optionExcerpt = css({
  textStyle: 'caption',
  color: 'ink.muted',
  '& mark': { bg: 'transparent', color: 'ink', fontWeight: '600' }
});
const message = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const textLink = css({
  color: 'signal',
  textDecorationLine: 'underline',
  textDecorationThickness: '1px',
  textUnderlineOffset: '0.2em'
});
const popularList = css({ listStyle: 'none', m: '0', p: '0', display: 'grid', gap: '1', mt: '2' });
const popularLink = css({
  display: 'flex',
  alignItems: 'center',
  minH: 'touch',
  px: '3',
  borderRadius: 'control',
  color: 'ink',
  textStyle: 'body',
  textDecoration: 'none',
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } }
});

function PopularGuides({ onNavigate }: { onNavigate: () => void }) {
  return (
    <ul className={popularList}>
      {POPULAR.map((slug) => {
        const page = findPage(slug);
        if (!page) return null;
        return (
          <li key={slug}>
            <NextLink href={pageHref(slug)} className={popularLink} onClick={onNavigate}>
              {page.title}
            </NextLink>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * ⌘K, Ctrl K or / opens it from anywhere. Focus is trapped while it's open (Ark Dialog);
 * arrow keys move through results and Enter opens one; Escape closes it and focus goes
 * back to the trigger. Results appear as you type, with no spinner: the index is static.
 */
export function SearchDialog({ finalFocusEl }: { finalFocusEl: () => HTMLElement | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState('');
  const [indexState, setIndexState] = useState<IndexState>('idle');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useRef(0);
  const listId = useId();

  const show = useCallback((initialQuery?: string) => {
    if (initialQuery !== undefined) setQuery(initialQuery);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable=true]');
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        show();
      }
    };
    const onOpen = (event: Event) => show((event as CustomEvent<OpenSearchDetail>).detail?.query);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const id = ++searchId.current;
    if (!term) return;
    loadPagefind()
      .then(async (pagefind) => {
        const { results } = await pagefind.search(term);
        const data = await Promise.all(results.slice(0, MAX_RESULTS).map((result) => result.data()));
        if (id !== searchId.current) return;
        setIndexState('ready');
        setHits(
          data.map((entry, index) => ({
            id: results[index].id,
            url: entry.url,
            title: entry.meta.title ?? entry.url,
            excerpt: entry.excerpt
          }))
        );
        setSearched(term);
        setActive(0);
      })
      .catch(() => {
        if (id === searchId.current) setIndexState('unavailable');
      });
  }, [open, query]);

  const term = query.trim();
  // An emptied field shows no results, without waiting for a search.
  const shown = term ? hits : [];
  const close = () => setOpen(false);
  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    close();
    router.push(hit.url as Route);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, Math.max(shown.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(shown[active]);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const noMatches = indexState === 'ready' && term !== '' && searched === term && shown.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Search the docs"
      instant
      initialFocusEl={() => inputRef.current}
      finalFocusEl={finalFocusEl}
    >
      <SearchInput
        ref={inputRef}
        label="Search the docs"
        placeholder="Search guides, ideas and reference"
        value={query}
        onValueChange={setQuery}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {indexState === 'unavailable' ? (
        <p className={message} role="status">
          Search isn’t available right now.{' '}
          <NextLink href={pageHref('guides/create/identity')} className={textLink} onClick={close}>
            Browse the guides instead.
          </NextLink>
        </p>
      ) : noMatches ? (
        <div role="status">
          <p className={message}>No pages match “{term}”. Try the glossary, or one of these:</p>
          <PopularGuides onNavigate={close} />
          <p className={cx(message, css({ mt: '2' }))}>
            <NextLink href={pageHref('reference/glossary')} className={textLink} onClick={close}>
              Open the glossary
            </NextLink>
          </p>
        </div>
      ) : null}
      <ul id={listId} role="listbox" aria-label="Results" className={listbox} hidden={shown.length === 0}>
        {shown.map((hit, index) => (
          <li
            key={hit.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className={option}
            onMouseMove={() => setActive(index)}
            onClick={() => go(hit)}
          >
            <span className={optionTitle}>{hit.title}</span>
            {/* Pagefind escapes the page text and wraps matches in <mark>. */}
            <span className={optionExcerpt} dangerouslySetInnerHTML={{ __html: hit.excerpt }} />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
