import { describe, expect, it } from 'vitest';

import {
  createEmptyDraft,
  sanitizeDrafts,
  selectDraft,
  selectHasDraft,
  useProposalComposerStore
} from './proposal-composer-store';

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

describe('sanitizeDrafts', () => {
  it('drops unknown action types instead of throwing and reports a notice', () => {
    const draft = {
      ...createEmptyDraft(),
      queuedActions: [
        { type: 'set-governor-authority', data: {} },
        { type: 'mint-governance-token', data: {} }
      ] as any
    };
    const { draftsByWallet, removed } = sanitizeDrafts({ W: { d: draft } }, (type) => type === 'mint-governance-token');
    const out = draftsByWallet.W.d;
    expect(removed).toBe(1);
    expect(out.queuedActions).toHaveLength(1);
    expect(out.queuedActions[0].type).toBe('mint-governance-token');
    expect(out.formMessage).toBe('1 unsupported action was removed from this draft');
  });

  it('leaves clean drafts untouched', () => {
    const draft = createEmptyDraft();
    const { draftsByWallet, removed } = sanitizeDrafts({ W: { d: draft } }, () => true);
    expect(removed).toBe(0);
    expect(draftsByWallet.W.d).toBe(draft);
  });
});
