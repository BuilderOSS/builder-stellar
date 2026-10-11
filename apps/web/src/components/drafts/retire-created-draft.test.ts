import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultConfiguration, useCreateDaoStore, type WorkspaceScope } from '@/stores/create-dao-store';
import { preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

import { retireCreatedDraft } from './retire-created-draft';

const data = new Map<string, string>();
const localStorage = {
  getItem: vi.fn((key: string) => data.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => data.set(key, value)),
  removeItem: vi.fn((key: string) => data.delete(key)),
  key: vi.fn((index: number) => [...data.keys()][index] ?? null),
  get length() {
    return data.size;
  }
};
const scope: WorkspaceScope = { network: 'testnet', deployment: 'manager-A', wallet: null };
const token = `C${'B'.repeat(55)}`;

beforeEach(async () => {
  vi.stubGlobal('window', { localStorage });
  vi.stubGlobal('localStorage', localStorage);
  data.clear();
  await Promise.all([useCreateDaoStore.persist.rehydrate(), useLocalPreferencesStore.persist.rehydrate()]);
  useCreateDaoStore.setState({ ...defaultConfiguration(), drafts: [], activeDraftId: null, validationErrors: {} });
});

describe('retireCreatedDraft', () => {
  it('keeps the launch choices made at creation, then removes the draft', () => {
    const store = useCreateDaoStore.getState();
    const id = store.newDraft(scope);
    store.resumeDraft(id);
    store.updateAuction({ enabled: true });
    store.updateMarketplace({ enabled: false });
    store.recordDeployment(id, {
      nonce: '1',
      deployer: 'wallet-A',
      status: 'confirmed',
      addresses: { token } as never
    });
    const draft = useCreateDaoStore.getState().drafts.find((d) => d.id === id)!;

    retireCreatedDraft(draft);

    const key = `${preferenceScopeKey({ network: 'testnet', deployment: 'manager-A', wallet: 'wallet-A' })}:${token}`;
    expect(useLocalPreferencesStore.getState().launches[key]).toMatchObject({ auction: true, marketplace: false });
    expect(useCreateDaoStore.getState().drafts.find((d) => d.id === id)).toBeUndefined();
  });
});
