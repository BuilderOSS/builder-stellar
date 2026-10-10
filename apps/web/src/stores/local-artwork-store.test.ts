import { beforeEach, expect, it, vi } from 'vitest';

import { useLocalArtworkStore } from './local-artwork-store';

const data = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
  removeItem: (key: string) => data.delete(key)
};
const plan = {
  baseUri: 'ipfs://bafytest/',
  extension: '.png',
  properties: [{ name: 'head', items: ['cat'] }],
  confirmedBatches: 0
};
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', { localStorage });
  useLocalArtworkStore.setState({ plans: {} });
});
it('persists artwork plans, layer order, and signed batch recovery under independent DAO scopes', async () => {
  const store = useLocalArtworkStore.getState();
  store.setPlan('scope:dao-A', { ...plan, hash: 'saved', status: 'submitted' });
  store.setPlan('scope:dao-B', plan);
  await useLocalArtworkStore.persist.rehydrate();
  expect(useLocalArtworkStore.getState().plans['scope:dao-A'].hash).toBe('saved');
  expect(useLocalArtworkStore.getState().plans['scope:dao-B'].hash).toBeUndefined();
});
it('does not reset a signed or confirmed batch from a stale tab', () => {
  const store = useLocalArtworkStore.getState();
  store.setPlan('scope:dao-A', { ...plan, hash: 'saved', status: 'submitted' });
  expect(() => store.setPlan('scope:dao-A', plan)).toThrow('Recover');
  store.setPlan('scope:dao-A', { ...plan, confirmedBatches: 1, status: 'confirmed' });
  expect(() => store.setPlan('scope:dao-A', plan)).toThrow('Recover');
});
it('retains the independently saved artwork receipt after a racing autosave', async () => {
  const store = useLocalArtworkStore.getState();
  store.setPlan('scope:dao-A', plan);
  const stale = data.get('dao.local-artwork.v1')!;
  store.setPlan('scope:dao-A', { ...plan, hash: 'preserved-hash', status: 'submitted' });
  data.set('dao.local-artwork.v1', stale);
  await useLocalArtworkStore.persist.rehydrate();
  expect(useLocalArtworkStore.getState().plans['scope:dao-A'].hash).toBe('preserved-hash');
  expect(() => store.setPlan('scope:dao-A', plan)).toThrow('Recover');
});
