import { describe, expect, it } from 'vitest';

import { buildProposalCallVectors, encodeProposalCallArgs } from '@/lib/proposal-call';
import { CHANGE_SOURCES } from '@/lib/proposal-changes/change-request';

import { claimListChange, claimListQueueActions } from './allocation-proposal';
import type { ClaimListDraft } from './proposal-actions';
import { CLAIMS, config, state, TOKEN, TREASURY, XLM } from './test-fixtures';

const draft: ClaimListDraft = {
  type: 'open-claim-list',
  root: 'ab'.repeat(32),
  treeUri: 'ipfs://bafytree',
  asset: XLM,
  price: '10000000',
  expiresAt: Math.floor(Date.now() / 1000) + 86_400,
  total: 12
};

describe('claim list proposals', () => {
  it('grants the ClaimMinter an allowance for the list, then opens the list, in one proposal', () => {
    const actions = claimListQueueActions(draft, state, config, 'deployment-a');
    expect(actions.map((action) => action.type)).toEqual(['change-mint-allowance', 'open-claim-list']);
    const vectors = buildProposalCallVectors(actions, TOKEN, TREASURY, config);
    expect(vectors.targets).toEqual([TOKEN, CLAIMS]);
    expect(vectors.functions).toEqual(['increase_mint_allowance', 'open_list']);
    expect(vectors.args[0]).toEqual([CLAIMS, 12]);
    const encoded = encodeProposalCallArgs(vectors.targets, vectors.functions, vectors.args, config);
    expect(encoded[1]!.map((value) => value.type)).toEqual([
      'scvBytes',
      'scvString',
      'scvAddress',
      'scvI128',
      'scvU64',
      'scvU32',
      'scvVoid'
    ]);
  });

  it('fails closed for another deployment, community, claims module, network or admin', () => {
    for (const change of [
      { deploymentId: 'dep-b' },
      { daoId: TREASURY },
      { claimsContractId: TOKEN },
      { claimsContractId: null },
      { network: 'public' },
      { admin: XLM }
    ])
      expect(() => claimListQueueActions(draft, { ...state, ...change }, config, 'deployment-a')).toThrow();
    for (const bad of [
      { root: 'zz' },
      { treeUri: 'https://x' },
      { asset: 'G' },
      { price: '-1' },
      { total: 0 },
      { expiresAt: 1 }
    ])
      expect(() => claimListQueueActions({ ...draft, ...bad }, state, config, 'deployment-a')).toThrow();
  });

  it('adds the allowance and the list as one change from Claim lists, with a note for members', () => {
    const change = claimListChange(draft, state, config, 'deployment-a', 7);
    expect(change.actions.map((action) => action.type)).toEqual(['change-mint-allowance', 'open-claim-list']);
    expect(change.bundle?.label).toBe('Open a claim list for 12 tokens: 2 steps');
    expect(change.source).toEqual(CHANGE_SOURCES.claims);
    expect(change.note).toContain('7 wallets');
    expect(change.note).toContain(draft.treeUri);
  });
});
