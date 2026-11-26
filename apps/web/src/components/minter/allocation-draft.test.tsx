import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { formatClaimDate } from '@/lib/minter/display';

import { LaunchDriveTerms } from './allocation-draft';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const DEADLINE = 1_900_000_000;
const drive = { people: 3, needed: 2, tokens: 3n, price: 0n, deadline: DEADLINE };
const render = (patch: Partial<typeof drive> = {}) =>
  renderToStaticMarkup(
    <LaunchDriveTerms
      drive={{ ...drive, ...patch }}
      network="testnet"
      asset=""
      launchAuction
      launchMarketplace={false}
    />
  ).replace(/<!-- -->/g, '');

describe('LaunchDriveTerms', () => {
  it('names the deadline the drive must meet', () => {
    expect(render()).toContain(
      `The tribe launches once 2 of them claim, by ${formatClaimDate(DEADLINE)}, and then auctions start.`
    );
  });

  it('leaves out a deadline a Date cannot hold', () => {
    // The Manager takes any future u64; u64::MAX has no date.
    const html = render({ deadline: Number(18446744073709551615n) });
    expect(html).toContain('The tribe launches once 2 of them claim, and then auctions start.');
    expect(html).not.toContain(', by');
    expect(html).not.toContain('Invalid Date');
  });
});
