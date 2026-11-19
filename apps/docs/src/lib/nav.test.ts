import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORE_IDEAS, findPage, NAV, neighbours, PAGES, PATHS, POPULAR } from './nav';
import { CONTENT_DIR } from './toc';

function contentSlugs(dir = CONTENT_DIR, prefix = ''): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? contentSlugs(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : entry.name.endsWith('.mdx')
          ? [`${prefix}${entry.name.replace(/\.mdx$/, '')}`]
          : []
    );
}

describe('docs information architecture', () => {
  it('has exactly one content file per nav page', () => {
    expect(contentSlugs().sort()).toEqual(PAGES.map((page) => page.slug).sort());
  });
  it('has unique slugs in the plan’s four sections', () => {
    expect(new Set(PAGES.map((page) => page.slug)).size).toBe(PAGES.length);
    expect(NAV.map((section) => section.title)).toEqual(['Start here', 'Concepts', 'Guides', 'Reference']);
  });
  it('links the home page and search only to real pages', () => {
    for (const slug of [...PATHS.map((p) => p.slug), ...CORE_IDEAS.map((i) => i.slug), ...POPULAR]) {
      expect(findPage(slug), slug).toBeDefined();
    }
  });
  it('chains Previous and Next through every page in reading order', () => {
    expect(neighbours(PAGES[0].slug).previous).toBeUndefined();
    expect(neighbours(PAGES[PAGES.length - 1].slug).next).toBeUndefined();
    expect(neighbours(PAGES[1].slug)).toEqual({ previous: PAGES[0], next: PAGES[2] });
  });
  it('keeps UI copy free of em dashes and the words the voice rules ban', () => {
    const copy = PAGES.flatMap((page) => [page.title, page.summary]).join('\n');
    expect(copy).not.toMatch(/—/);
    expect(copy).not.toMatch(/\b(simply|just)\b/i);
  });
});
