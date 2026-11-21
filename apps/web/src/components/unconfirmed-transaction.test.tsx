import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { UnconfirmedTransaction } from './unconfirmed-transaction';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

describe('UnconfirmedTransaction', () => {
  it('shows a recovery state with the transaction and a way to check again, not a failure', () => {
    const html = renderToStaticMarkup(
      <UnconfirmedTransaction
        network="testnet"
        pending={{ hash: 'abc123', subject: 'Your vote' }}
        checking={false}
        onCheck={() => {}}
      />
    ).replace(/<!-- -->/g, '');
    expect(html).toContain('Waiting for confirmation…');
    expect(html).toContain('Your vote was sent, but the network hasn&#x27;t confirmed it yet.');
    expect(html).toMatch(/href="[^"]*\/tx\/abc123"/);
    expect(html).toContain('Check the transaction');
    expect(html).toContain('Check again');
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/failed|Error:/);
  });
});
