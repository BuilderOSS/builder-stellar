import { describe, expect, it } from 'vitest';

import { moveLayer } from '@/lib/layer-order';

describe('moveLayer', () => {
  it('moves a layer down one position', () => {
    expect(moveLayer(['base', 'body', 'head'], 1, 3)).toEqual(['base', 'head', 'body']);
  });

  it('moves a layer up one position', () => {
    expect(moveLayer(['base', 'body', 'head'], 1, 0)).toEqual(['body', 'base', 'head']);
  });
});
