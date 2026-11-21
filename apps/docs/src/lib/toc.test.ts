import { describe, expect, it } from 'vitest';

import { extractToc } from './toc';

describe('extractToc', () => {
  it('lists h2 and h3 with the ids rehype-slug gives them', () => {
    const toc = extractToc(`<Placeholder />

## Overview

### Who’s at it?

## What happens on chain

<Disclosure title="x">
## Steps
</Disclosure>

## Steps

#### Deep
`);
    expect(toc).toEqual([
      { id: 'overview', text: 'Overview', depth: 2 },
      { id: 'whos-at-it', text: 'Who’s at it?', depth: 3 },
      { id: 'what-happens-on-chain', text: 'What happens on chain', depth: 2 },
      { id: 'steps', text: 'Steps', depth: 2 },
      // The repeated title takes the suffix, as rehype-slug does.
      { id: 'steps-1', text: 'Steps', depth: 2 }
    ]);
  });
});
