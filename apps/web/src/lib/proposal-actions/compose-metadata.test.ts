import { describe, expect, it } from 'vitest';

import { PROPOSAL_DESCRIPTION_MAX_BYTES, proposalDescriptionBytes } from '@/lib/proposal-metadata';

import {
  actionLines,
  applyWhatThisDoes,
  stripWhatThisDoes,
  suggestTitle,
  WHAT_THIS_DOES_HEADING
} from './compose-metadata';
import { action, setting } from './test-fixtures';

const auction = [action('pause-auction'), setting('set-auction-duration', '600'), action('unpause-auction')].map(
  (entry) => ({
    ...entry,
    bundleId: 'b',
    bundleLabel: 'Change the auction: 3 steps',
    note: 'Each auction runs 10 minutes.'
  })
);

describe('proposal text from its actions', () => {
  it('suggests a title from the first action and counts the rest', () => {
    expect(suggestTitle([])).toBe('');
    expect(suggestTitle([setting('set-quorum-bps', '1000')])).toBe('Change the quorum to 10%');
    expect(suggestTitle([...auction, setting('set-quorum-bps', '1000')])).toBe('Change the auction and 1 more action');
    // A bundle after the lead counts every step, like the composer's count.
    expect(suggestTitle([setting('set-quorum-bps', '1000'), ...auction])).toBe(
      `Change the quorum to 10% and ${auction.length} more actions`
    );
  });

  it('writes one line per action, from its note when it has one', () => {
    const quorum = { ...setting('set-quorum-bps', '1000'), note: 'Lower the bar to 10%.' };
    expect(actionLines([...auction, quorum, setting('set-voting-period', '86400')])).toEqual([
      'Change the auction. Each auction runs 10 minutes.',
      'Lower the bar to 10%.',
      'Change how long voting stays open to 1 day.'
    ]);
  });

  it('replaces an earlier "What this does" section and keeps the member’s own text', () => {
    const metadata = { title: 'T', description: 'Why we want it.', url: '' };
    const once = applyWhatThisDoes([setting('set-quorum-bps', '1000')], metadata);
    expect(once.startsWith('Why we want it.')).toBe(true);
    expect(once).toContain(WHAT_THIS_DOES_HEADING);
    const twice = applyWhatThisDoes(auction, { ...metadata, description: once });
    expect(twice.match(new RegExp(WHAT_THIS_DOES_HEADING, 'g'))).toHaveLength(1);
    expect(twice).toContain('Change the auction');
    expect(twice).not.toContain('quorum');
    expect(stripWhatThisDoes(twice)).toBe('Why we want it.');
  });

  it('stays inside the description budget, counting what it leaves out', () => {
    const long = Array.from({ length: 40 }, (_, index) => ({
      ...action('transfer-sac-token', { recipient: 'G', amount: String(index + 1) }),
      note: 'x'.repeat(200)
    }));
    const metadata = { title: 'T', description: 'Why.', url: '' };
    const description = applyWhatThisDoes(long, metadata);
    expect(proposalDescriptionBytes({ ...metadata, description })).toBeLessThanOrEqual(PROPOSAL_DESCRIPTION_MAX_BYTES);
    expect(description).toMatch(/And \d+ more actions, listed with the proposal\./);
  });
});
