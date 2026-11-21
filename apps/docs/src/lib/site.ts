import type { ThemePreference } from '@builder-stellar/design-tokens/theme';

export const DOCS_NAME = 'Tribe Builder Docs';
export const DOCS_DESCRIPTION =
  'How to start, join, and run a tribe on Tribe Builder: guides, concepts, and reference.';
/** NEXT_PUBLIC_DOCS_URL overrides it per deployment (previews). */
export const DOCS_URL = new URL(process.env.NEXT_PUBLIC_DOCS_URL?.trim() || 'https://docs.tribes.build');
export const APP_URL = 'https://tribes.build';

/** Custom event that opens the search dialog, optionally with a query (the 404 page's field). */
export const OPEN_SEARCH_EVENT = 'docs:open-search';
export type OpenSearchDetail = { query?: string };

export function openSearch(query?: string) {
  window.dispatchEvent(new CustomEvent<OpenSearchDetail>(OPEN_SEARCH_EVENT, { detail: { query } }));
}

/**
 * The docs follow the reader's system until they choose. The app starts dark, but a
 * reader arriving from search has made no choice yet (docs plan §5.4a: cookie, then
 * localStorage, then System).
 */
export const DOCS_DEFAULT_THEME: ThemePreference = 'system';
