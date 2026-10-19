import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownField } from './markdown-field';

describe('MarkdownField', () => {
  beforeEach(() => vi.stubGlobal('React', React));

  it('offers formatting, write and preview, and image upload for rich text', () => {
    const html = renderToStaticMarkup(<MarkdownField id="why" value="hi" onChange={() => {}} canUpload />);
    for (const label of ['Bold (⌘B)', 'Italic (⌘I)', 'Link (⌘K)', 'List', 'Quote', 'Add an image']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('Write');
    expect(html).toContain('Preview');
    expect(html).not.toContain('Drop or paste images to add them.');
    expect(html).not.toContain('Markdown works');
  });

  it('asks for a sign-in before images, and offers them in comments too', () => {
    expect(renderToStaticMarkup(<MarkdownField id="why" value="" onChange={() => {}} />)).toContain(
      'aria-label="Sign in to add images"'
    );
    const comment = renderToStaticMarkup(
      <MarkdownField id="c" value="" onChange={() => {}} variant="comment" canUpload />
    );
    expect(comment).toContain('aria-label="Add an image"');
  });
});
