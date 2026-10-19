import { describe, expect, it } from 'vitest';

import {
  createEmptyDraft,
  sanitizeDrafts,
  selectCanProceedToStep2,
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

    useProposalComposerStore.getState().updateMetadata(walletA, daoId, { title: 'Wallet A draft' });

    const state = useProposalComposerStore.getState();
    expect(selectHasDraft(walletA.toLowerCase(), daoId)(state)).toBe(true);
    expect(selectDraft(walletA.toLowerCase(), daoId)(state).metadata.title).toBe('Wallet A draft');
    expect(selectHasDraft(walletB, daoId)(state)).toBe(false);
    expect(selectDraft(null, daoId)(state).metadata.title).toBe('');

    clearDraft(walletA);
    clearDraft(walletB);
  });
});

describe('proposal composer v4 actions', () => {
  const wallet = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
  const queued = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, type: 'pause-auction', recipient: '', amount: '', ...extra }) as any;

  it('adds changes without moving the step, replaces by id in place, and restores for undo', () => {
    clearDraft(wallet);
    const store = useProposalComposerStore.getState();
    store.setStep(wallet, daoId, 2);
    store.addChanges(wallet, daoId, [queued('a'), queued('b'), queued('c')]);
    store.replaceById(wallet, daoId, ['b'], [queued('b2')]);
    let draft = selectDraft(wallet, daoId)(useProposalComposerStore.getState());
    expect(draft.step).toBe(2);
    expect(draft.queuedActions.map((action) => action.id)).toEqual(['a', 'b2', 'c']);
    const before = draft.queuedActions;
    store.removeById(wallet, daoId, 'a');
    store.restore(wallet, daoId, before);
    draft = selectDraft(wallet, daoId)(useProposalComposerStore.getState());
    expect(draft.queuedActions.map((action) => action.id)).toEqual(['a', 'b2', 'c']);
    clearDraft(wallet);
  });

  it('removes and moves a bundle as one row', () => {
    clearDraft(wallet);
    const store = useProposalComposerStore.getState();
    store.addChanges(wallet, daoId, [queued('x'), queued('p', { bundleId: 'B' }), queued('q', { bundleId: 'B' })]);
    store.moveItem(wallet, daoId, 1, 0);
    expect(selectDraft(wallet, daoId)(useProposalComposerStore.getState()).queuedActions.map((a) => a.id)).toEqual([
      'p',
      'q',
      'x'
    ]);
    store.removeById(wallet, daoId, 'q');
    expect(selectDraft(wallet, daoId)(useProposalComposerStore.getState()).queuedActions.map((a) => a.id)).toEqual([
      'x'
    ]);
    clearDraft(wallet);
  });

  it('can move on from the actions step before the why is written', () => {
    clearDraft(wallet);
    useProposalComposerStore.getState().addChanges(wallet, daoId, [queued('only')]);
    expect(selectCanProceedToStep2(wallet, daoId)(useProposalComposerStore.getState())).toBe(true);
    clearDraft(wallet);
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
