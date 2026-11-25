import type { Assurance } from '@builder-stellar/manager-bindings';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/contexts/dao-context', () => ({ useDaoContext: () => ({ routeId: 'lantern-club' }) }));
vi.mock('./release-slug', () => ({ ReleaseSlug: () => null }));

import { formatClaimDate } from '@/lib/minter/display';

import { LaunchDriveCard } from './launch-card';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const NOW = 1_900_000_000;
// The Manager takes any future u64 as a drive's deadline; u64::MAX has no date.
const U64_MAX = 18446744073709551615n;
const drive = (deadline: bigint): Assurance => ({
  claim_minter: 'CMINTER',
  deadline,
  launch_config: { launch_auction: true, launch_marketplace: false },
  list_id: 0
});
const render = (deadline: bigint) =>
  renderToStaticMarkup(<LaunchDriveCard assurance={drive(deadline)} name="Lantern Club" />).replace(/<!-- -->/g, '');

describe('LaunchDriveCard deadline wording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it('names the deadline of an open drive', () => {
    const html = render(BigInt(NOW + 86_400));
    expect(html).toContain(
      `Lantern Club launches once enough people claim, by ${formatClaimDate(NOW + 86_400)}. Anyone can press launch`
    );
  });

  it('leaves out a deadline a Date cannot hold', () => {
    const html = render(U64_MAX);
    expect(html).toContain('Launch drive open');
    expect(html).toContain('Lantern Club launches once enough people claim. Anyone can press launch');
    expect(html).not.toContain(', by');
    expect(html).not.toContain('Invalid Date');
  });

  it('names the deadline an ended drive missed', () => {
    const html = render(BigInt(NOW - 60));
    expect(html).toContain('The launch drive ended');
    expect(html).toContain(
      `Lantern Club did not reach enough claims by ${formatClaimDate(NOW - 60)}, so it can&#x27;t launch.`
    );
  });
});
