import { beforeEach, expect, it, vi } from 'vitest';

import { assertPreferencesSaved, preferenceScopeKey, useLocalPreferencesStore } from './local-preferences-store';

const map = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => map.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => map.set(key, value)),
  removeItem: (key: string) => map.delete(key)
};
beforeEach(() => {
  vi.stubGlobal('window', { localStorage });
  map.clear();
  localStorage.setItem.mockImplementation((key, value) => map.set(key, value));
  useLocalPreferencesStore.setState({ homes: {}, launches: {} });
});
it('persists independent home preferences across wallet, network, and deployment', async () => {
  const scope = { network: 'testnet' as const, deployment: 'manager-A', wallet: null };
  const store = useLocalPreferencesStore.getState();
  store.setHome(scope, { id: 'dao-A', name: 'Guest home' });
  store.setHome({ ...scope, wallet: 'wallet-A' }, { id: 'dao-B', name: 'Wallet home' });
  await useLocalPreferencesStore.persist.rehydrate();
  expect(useLocalPreferencesStore.getState().homes[preferenceScopeKey(scope)]?.id).toBe('dao-A');
  expect(useLocalPreferencesStore.getState().homes[preferenceScopeKey({ ...scope, wallet: 'wallet-A' })]?.id).toBe(
    'dao-B'
  );
  expect(
    useLocalPreferencesStore.getState().homes[preferenceScopeKey({ ...scope, network: 'public' })]
  ).toBeUndefined();
  expect(
    useLocalPreferencesStore.getState().homes[preferenceScopeKey({ ...scope, deployment: 'manager-B' })]
  ).toBeUndefined();
  store.setHome(scope, null);
  expect(useLocalPreferencesStore.getState().homes[preferenceScopeKey(scope)]).toBeUndefined();
});
it('retains submitted launch hashes and actual module choices on reload', async () => {
  useLocalPreferencesStore.getState().setLaunch('scoped-dao', {
    auction: false,
    marketplace: true,
    minter: false,
    hash: 'saved-hash',
    status: 'submitted'
  });
  await useLocalPreferencesStore.persist.rehydrate();
  expect(useLocalPreferencesStore.getState().launches['scoped-dao']).toMatchObject({
    hash: 'saved-hash',
    status: 'submitted',
    auction: false,
    marketplace: true
  });
});
it('keeps a launch receipt independent from a stale preference autosave', async () => {
  const store = useLocalPreferencesStore.getState();
  store.setLaunch('dao', { auction: true, marketplace: false, minter: false });
  const stale = map.get('dao.local-preferences.v1')!;
  store.setLaunch('dao', { auction: true, marketplace: false, minter: false, hash: 'saved-hash', status: 'submitted' });
  map.set('dao.local-preferences.v1', stale);
  await useLocalPreferencesStore.persist.rehydrate();
  expect(useLocalPreferencesStore.getState().launches.dao.hash).toBe('saved-hash');
  expect(() => store.setLaunch('dao', { auction: false, marketplace: false, minter: false })).toThrow('Recover');
});
it('reports quota failures before a transaction can be sent', () => {
  localStorage.setItem.mockImplementation(() => {
    throw new Error('quota');
  });
  useLocalPreferencesStore.getState().setLaunch('dao', { auction: false, marketplace: false, minter: false });
  expect(assertPreferencesSaved).toThrow('recovery');
});
