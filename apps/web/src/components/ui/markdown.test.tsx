import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Markdown, safeMarkdownUrl } from './markdown';

const render = (source: string, variant?: 'rich' | 'comment') =>
  renderToStaticMarkup(<Markdown source={source} variant={variant} />);

describe('Markdown', () => {
  beforeEach(() => vi.stubGlobal('React', React));

  it('renders formatting, lists and tables', () => {
    const html = render('**bold** _it_\n\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>it</em>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<table>');
  });

  it('never renders raw html and drops unsafe links', () => {
    const html = render('<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('opens web links in a new tab without leaking the opener', () => {
    const html = render('[site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('shows ipfs images through the gateway fallback image', () => {
    const html = render('![plan](ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi)');
    expect(html).toContain('alt="plan"');
    expect(html).toContain('/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
  });

  it('moves headings down a level', () => {
    const html = render('# Title\n\n## Part');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<h3>Part</h3>');
    expect(html).not.toContain('<h1');
  });

  it('renders comment headings and tables while keeping a single page heading', () => {
    const html = render('# Big\n\n**ok** ![img](https://x.y/a.png)\n\n| A |\n|---|\n| 1 |', 'comment');
    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2>Big</h2>');
    expect(html).toContain('<img');
    expect(html).toContain('<table');
    expect(html).toContain('Big');
    expect(html).toContain('<strong>ok</strong>');
  });
  it('keeps comment task-list checkboxes disabled and rejects raw form controls', () => {
    const html = render('- [ ] Pending\n- [x] Done\n\n<input type="text" value="editable">', 'comment');
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input).toContain('type="checkbox"');
      expect(input).toContain('disabled=""');
    }
    expect(html).not.toContain('editable');
  });
});

describe('safeMarkdownUrl', () => {
  it('allows web, mail and ipfs addresses only', () => {
    expect(safeMarkdownUrl('https://a.b')).toBe('https://a.b');
    expect(safeMarkdownUrl('ipfs://cid')).toBe('ipfs://cid');
    expect(safeMarkdownUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeMarkdownUrl('javascript:alert(1)')).toBeNull();
    expect(safeMarkdownUrl('data:text/html,x')).toBeNull();
    expect(safeMarkdownUrl('/relative')).toBeNull();
  });
});
