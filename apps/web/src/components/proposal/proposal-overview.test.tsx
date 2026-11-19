import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { ProposalState } from '@/lib/proposal-state';

import { ProposalLifecyclePanel } from './proposal-overview';
import type { ProposalDetail } from './types';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const expired = (patch: Partial<ProposalDetail>) =>
  ({
    state: ProposalState.Expired,
    vote_start: 100,
    vote_end: 200,
    eta: 0,
    etaSource: 'chain',
    expiresAt: null,
    ...patch
  }) as ProposalDetail;
const render = (detail: ProposalDetail) => renderToStaticMarkup(<ProposalLifecyclePanel detail={detail} now={0} />);

describe('ProposalLifecyclePanel, expired', () => {
  it('says a passed proposal was never queued when it has no execution time', () => {
    const html = render(expired({ eta: 0, etaSource: 'chain' }));
    expect(html).toContain('It passed, but nobody queued it before the deadline.');
    expect(html).not.toContain('executed');
  });

  it('says a queued proposal was never executed when it has an execution time', () => {
    expect(render(expired({ eta: 500, etaSource: 'chain' }))).toContain(
      'It was queued, but nobody executed it before the deadline.'
    );
  });

  it('stays neutral when the execution time is unknown', () => {
    expect(render(expired({ eta: 0, etaSource: 'unavailable' }))).toContain(
      'It passed, but its deadline to be queued or executed has passed.'
    );
  });
});
