import { beforeEach, expect, it, vi } from 'vitest';

import { assertPreferencesSaved, useLocalPreferencesStore } from './local-preferences-store';

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
  useLocalPreferencesStore.setState({ launches: {} });
});
it('drops the retired home preference from older saves on the next write', async () => {
  map.set(
    'dao.local-preferences.v1',
    JSON.stringify({ state: { homes: { scope: { id: 'dao-A', name: 'Old home' } }, launches: {} }, version: 1 })
  );
  await useLocalPreferencesStore.persist.rehydrate();
  useLocalPreferencesStore.getState().setLaunch('dao', { auction: true, marketplace: false });
  const saved = JSON.parse(map.get('dao.local-preferences.v1')!).state;
  expect(saved.homes).toBeUndefined();
  expect(saved.launches.dao).toMatchObject({ auction: true, marketplace: false });
});
it('retains submitted launch hashes and actual module choices on reload', async () => {
  useLocalPreferencesStore.getState().setLaunch('scoped-dao', {
    auction: false,
    marketplace: true,
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
  store.setLaunch('dao', { auction: true, marketplace: false });
  const stale = map.get('dao.local-preferences.v1')!;
  store.setLaunch('dao', { auction: true, marketplace: false, hash: 'saved-hash', status: 'submitted' });
  map.set('dao.local-preferences.v1', stale);
  await useLocalPreferencesStore.persist.rehydrate();
  expect(useLocalPreferencesStore.getState().launches.dao.hash).toBe('saved-hash');
  expect(() => store.setLaunch('dao', { auction: false, marketplace: false })).toThrow('Recover');
});
it('reports quota failures before a transaction can be sent', () => {
  localStorage.setItem.mockImplementation(() => {
    throw new Error('quota');
  });
  useLocalPreferencesStore.getState().setLaunch('dao', { auction: false, marketplace: false });
  expect(assertPreferencesSaved).toThrow('recovery');
});
