import { describe, expect, it } from 'vitest';

import { markdownToText } from './markdown-text';

describe('markdownToText', () => {
  it('keeps the words and drops the formatting', () => {
    expect(
      markdownToText(
        '# Fund the library\n\n**Why:** members _asked_ for it.\n\n- one\n- [two](https://x.y)\n\n> quoted'
      )
    ).toBe('Fund the library Why: members asked for it. one two quoted');
  });
  it('keeps underscores inside words and image alt text', () => {
    expect(markdownToText('Call `set_reserve_price` ![the plan](ipfs://cid)')).toBe('Call set_reserve_price the plan');
  });
  it('drops code blocks, raw html and table rules', () => {
    expect(markdownToText('a\n```\ncode\n```\n<b>x</b>\n| A | B |\n|---|---|\n| 1 | 2 |')).toBe('a x A B 1 2');
  });
  it('truncates with an ellipsis', () => {
    expect(markdownToText('one two three four', 9)).toBe('one two…');
  });
});
