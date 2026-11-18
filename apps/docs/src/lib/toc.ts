import fs from 'node:fs';
import path from 'node:path';

import GithubSlugger from 'github-slugger';
import type { Heading, Nodes, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type TocEntry = { id: string; text: string; depth: 2 | 3 };

export const CONTENT_DIR = path.join(process.cwd(), 'content');

export function contentFile(slug: string): string {
  return path.join(CONTENT_DIR, `${slug}.mdx`);
}

/**
 * The h2 and h3 headings of an MDX page, with the ids rehype-slug gives them (both use
 * github-slugger, in document order). Read at build time; the site is static.
 */
export function extractToc(source: string): TocEntry[] {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(source) as Root;
  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];
  // Every heading takes a slug, even ones nested in components or deeper than h3, so
  // repeated titles get the same -1, -2 suffixes rehype-slug gives them.
  const walk = (node: Nodes) => {
    if (node.type === 'heading') {
      const heading = node as Heading;
      const text = toString(heading);
      const id = slugger.slug(text);
      if (heading.depth === 2 || heading.depth === 3) entries.push({ id, text, depth: heading.depth });
      return;
    }
    if ('children' in node) for (const child of node.children) walk(child as Nodes);
  };
  walk(tree);
  return entries;
}

export function tocForSlug(slug: string): TocEntry[] {
  return extractToc(fs.readFileSync(contentFile(slug), 'utf8'));
}
