import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProposalVoteSummary } from './proposal-vote-summary';

describe('ProposalVoteSummary quorum line', () => {
  beforeEach(() => vi.stubGlobal('React', React));

  it('says how many votes there are and how many are needed (BUG-CAP-10)', () => {
    const html = renderToStaticMarkup(
      <ProposalVoteSummary totals={{ for: '5', against: '0', abstain: '0' }} quorumVotes="1" />
    );
    expect(html).toContain('Quorum reached: 5 votes, 1 needed');
    expect(html).not.toContain('(5 of 1)');
  });

  it('uses the singular for one vote', () => {
    const html = renderToStaticMarkup(
      <ProposalVoteSummary totals={{ for: '1', against: '0', abstain: '0' }} quorumVotes="1" />
    );
    expect(html).toContain('Quorum reached: 1 vote, 1 needed');
  });
});
