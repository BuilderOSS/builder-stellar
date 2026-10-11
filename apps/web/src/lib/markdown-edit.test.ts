import { describe, expect, it } from 'vitest';

import {
  dropPlaceholder,
  imageMarkdown,
  insertBlock,
  insertLink,
  prefixLines,
  resolvePlaceholder,
  uploadPlaceholder,
  wrapSelection
} from './markdown-edit';

describe('markdown edits', () => {
  it('wraps the selection, or a placeholder word, and selects the inside', () => {
    expect(wrapSelection('make it bold', 8, 12, '**')).toEqual({ value: 'make it **bold**', start: 10, end: 14 });
    expect(wrapSelection('x ', 2, 2, '_')).toEqual({ value: 'x _text_', start: 3, end: 7 });
  });

  it('unwraps a selection that is already wrapped', () => {
    expect(wrapSelection('make it **bold**', 10, 14, '**')).toEqual({ value: 'make it bold', start: 8, end: 12 });
  });

  it('turns the selection into a link and selects the url to type over', () => {
    const edit = insertLink('see docs', 4, 8);
    expect(edit.value).toBe('see [docs](https://)');
    expect(edit.value.slice(edit.start, edit.end)).toBe('https://');
  });

  it('prefixes every selected line, and removes the prefix when all have it', () => {
    expect(prefixLines('one\ntwo\nthree', 0, 7, '- ').value).toBe('- one\n- two\nthree');
    expect(prefixLines('- one\n- two', 0, 11, '- ').value).toBe('one\ntwo');
  });

  it('puts an image on its own line', () => {
    expect(insertBlock('before after', 6, '![a](ipfs://x)').value).toBe('before\n![a](ipfs://x)\n after');
    expect(insertBlock('', 0, '![a](ipfs://x)').value).toBe('![a](ipfs://x)');
  });

  it('swaps the upload placeholder for the image even after more typing', () => {
    const marker = uploadPlaceholder('plan [v2].png', 'abc12345');
    expect(marker).toBe('![Uploading plan v2.png… abc12345]()');
    const typed = `intro\n${marker}\nmore text`;
    expect(resolvePlaceholder(typed, marker, imageMarkdown('plan [v2].png', 'ipfs://cid'))).toBe(
      'intro\n![plan v2](ipfs://cid)\nmore text'
    );
    expect(dropPlaceholder(typed, marker)).toBe('intro\nmore text');
  });
});
