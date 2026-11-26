import { afterAll, describe, expect, it, vi } from 'vitest';

const registry = vi.hoisted(() => ({ loads: 0 }));
vi.mock('@/lib/proposal-actions/registry', () => {
  registry.loads += 1;
  return { isRegisteredActionType: (type: string) => type !== 'retired-action' };
});

const WALLET = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const DAO_ID = 'dao-rehydrate-test';

/** A saved draft as the store writes it, holding one action the registry no longer knows. */
function savedDrafts() {
  const action = (id: string, type: string) => ({ id, type, recipient: '', amount: '' });
  const draft = {
    step: 2,
    metadata: { title: 'Saved draft', description: '', url: '' },
    queuedActions: [action('a', 'retired-action'), action('b', 'pause-auction')],
    editingState: null,
    updatedAt: 1,
    validationErrors: null,
    formMessage: '',
    busy: false
  };
  return JSON.stringify({ state: { draftsByWallet: { [WALLET]: { [DAO_ID]: draft } } }, version: 0 });
}

function fakeLocalStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  };
}

afterAll(() => vi.unstubAllGlobals());

describe('proposal composer rehydration', () => {
  it('does not load the action registry when nothing is saved', async () => {
    await import('./proposal-composer-store');
    await vi.dynamicImportSettled();
    expect(registry.loads).toBe(0);
  });

  it('drops saved actions the registry no longer knows', async () => {
    const { STORAGE_KEY } = await import('./proposal-composer-store');
    vi.stubGlobal('window', { localStorage: fakeLocalStorage({ [STORAGE_KEY]: savedDrafts() }) });
    vi.resetModules();
    const { selectDraft, useProposalComposerStore } = await import('./proposal-composer-store');
    await vi.dynamicImportSettled();
    expect(registry.loads).toBe(1);
    await vi.waitFor(() => {
      const draft = selectDraft(WALLET, DAO_ID)(useProposalComposerStore.getState());
      expect(draft.queuedActions.map((action) => action.id)).toEqual(['b']);
    });
    expect(selectDraft(WALLET, DAO_ID)(useProposalComposerStore.getState()).metadata.title).toBe('Saved draft');
  });
});
