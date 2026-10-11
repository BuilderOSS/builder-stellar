import { describe, expect, it } from 'vitest';

import { toOneLine } from './comments';

describe('toOneLine', () => {
  it('folds line breaks, with the spaces around them, into one space', () => {
    expect(toOneLine('gm\n\nfrom the  \r\n  lantern club')).toBe('gm from the lantern club');
    expect(toOneLine('already one line')).toBe('already one line');
  });
});
