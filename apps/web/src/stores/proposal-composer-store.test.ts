import { describe, expect, it } from 'vitest';

import { selectDraft, selectHasDraft, useProposalComposerStore } from './proposal-composer-store';

const daoId = 'dao-wallet-scope-test';

function clearDraft(address: string) {
  useProposalComposerStore.getState().reset(address, daoId);
}

describe('proposal composer wallet scoping', () => {
  it('isolates drafts for the same DAO between wallets', () => {
    const walletA = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const walletB = 'gbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    clearDraft(walletA);
    clearDraft(walletB);

    useProposalComposerStore.getState().replaceDraft(walletA, daoId, {
      metadata: { title: 'Wallet A draft', description: '', url: '' }
    });

    const state = useProposalComposerStore.getState();
    expect(selectHasDraft(walletA.toLowerCase(), daoId)(state)).toBe(true);
    expect(selectDraft(walletA.toLowerCase(), daoId)(state).metadata.title).toBe('Wallet A draft');
    expect(selectHasDraft(walletB, daoId)(state)).toBe(false);
    expect(selectDraft(null, daoId)(state).metadata.title).toBe('');

    clearDraft(walletA);
    clearDraft(walletB);
  });
});
