import { describe, expect, it } from 'vitest';

import { analyzeProposalAction, getProposalActionIdentity, isHighRiskProposalAction } from './proposal-action-identity';
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

  it('uses per-module upgrade resources and exact leading-zero/case-normalized WASM hashes', () => {
    const fromHash = '0'.repeat(63) + '1';
    const toHash = '00' + 'AB'.repeat(31);
    const first = action({ id: 'one', type: 'upgrade-dao-module', module: 'token', fromHash, toHash });
    const same = action({ ...first, id: 'two', toHash: toHash.toLowerCase() });
    expect(getProposalActionIdentity(first).normalizedArgs.fromHash).toBe(fromHash);
    expect(getProposalActionIdentity(first).key).toBe(getProposalActionIdentity(same).key);
    expect(analyzeProposalAction(same, [first]).some((finding) => finding.kind === 'duplicate')).toBe(true);
    expect(
      analyzeProposalAction(action({ ...first, id: 'three', toHash: 'cd'.repeat(32) }), [first]).some(
        (finding) => finding.kind === 'conflict'
      )
    ).toBe(true);
    expect(
      analyzeProposalAction(action({ ...first, id: 'four', module: 'treasury' }), [first]).some(
        (finding) => finding.kind === 'conflict' || finding.kind === 'duplicate'
      )
    ).toBe(false);
    expect(isHighRiskProposalAction(first)).toBe(true);
  });

  it('keeps ordered append occurrences separate, even for repeated identical payloads', () => {
    const first = action({
      id: 'batch1',
      type: 'add-artwork-properties',
      names: ['007'],
      items: [{ name: ' 01 ', property_id: 0, is_new_property: true }],
      ipfsGroup: { base_uri: 'ipfs://collection', extension: '.png' }
    });
    const second = action({ ...first, id: 'batch2' });
    const third = action({
      ...first,
      id: 'batch3',
      items: [{ name: 'Second', property_id: 0, is_new_property: false }]
    });
    expect(getProposalActionIdentity(first).key).not.toBe(getProposalActionIdentity(second).key);
    expect(getProposalActionIdentity(first).normalizedArgs.names).toEqual(['007']);
    expect(getProposalActionIdentity(first).normalizedArgs.items).toEqual([
      { name: ' 01 ', property_id: 0, is_new_property: true }
    ]);
    for (const next of [second, third])
      expect(
        analyzeProposalAction(next, [first]).some(
          (finding) => finding.kind === 'duplicate' || finding.kind === 'conflict'
        )
      ).toBe(false);
    expect(isHighRiskProposalAction(first)).toBe(true);
  });

  it('flags metadata settings/address changes as high risk and distinguishes exact string values', () => {
    const description = action({ type: 'set-artwork-description', value: '007' });
    const other = action({ ...description, id: 'other', value: '7' });
    expect(getProposalActionIdentity(description).key).not.toBe(getProposalActionIdentity(other).key);
    expect(analyzeProposalAction(other, [description]).some((finding) => finding.kind === 'conflict')).toBe(true);
    for (const type of [
      'set-artwork-renderer',
      'set-artwork-description',
      'set-artwork-project-uri',
      'set-artwork-contract-image',
      'set-marketplace-payment-token',
      'set-auction-payment-token'
    ] as const)
      expect(isHighRiskProposalAction(action({ type }))).toBe(true);
  });
});
