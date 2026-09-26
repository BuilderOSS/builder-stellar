import { describe, expect, it } from 'vitest';

import { analyzeProposalAction, getProposalActionIdentity } from './proposal-action-identity';
import type { ProposalQueuedAction } from './proposal-actions/types';

const action = (patch: Partial<ProposalQueuedAction>): ProposalQueuedAction => ({
  id: 'test-id',
  type: 'set-voting-delay',
  recipient: '',
  amount: '',
  ...patch
});

describe('proposal action identity', () => {
  it('ignores generated ids and normalizes addresses and numeric strings', () => {
    const first = getProposalActionIdentity(
      action({ id: 'one', type: 'batch-mint-governance-token', recipient: 'gabc', amount: '01' })
    );
    const second = getProposalActionIdentity(
      action({ id: 'two', type: 'batch-mint-governance-token', recipient: ' GABC ', amount: '1' })
    );

    expect(first.key).toBe(second.key);
  });

  it('finds exact duplicates', () => {
    const existing = action({ value: '10' });
    const findings = analyzeProposalAction(action({ id: 'new', value: '10' }), [existing]);

    expect(findings.some((finding) => finding.kind === 'duplicate')).toBe(true);
  });

  it('finds conflicting updates to the same resource', () => {
    const existing = action({ value: '10' });
    const findings = analyzeProposalAction(action({ id: 'new', value: '20' }), [existing]);

    expect(findings.some((finding) => finding.kind === 'conflict')).toBe(true);
  });

  it('finds pause and unpause as a conflict', () => {
    const existing = action({ type: 'pause-auction' });
    const findings = analyzeProposalAction(action({ id: 'new', type: 'unpause-auction' }), [existing]);

    expect(findings.some((finding) => finding.kind === 'conflict')).toBe(true);
  });
});
