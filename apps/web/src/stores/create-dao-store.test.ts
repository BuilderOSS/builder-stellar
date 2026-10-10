import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertCreationSaved,
  CREATE_WORKSPACE_KEY,
  defaultConfiguration,
  migrateCreationWorkspace,
  useCreateDaoStore,
  visibleDraft,
  type WorkspaceScope
} from './create-dao-store';

const data = new Map<string, string>();
const localStorage = {
  getItem: vi.fn((key: string) => data.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => data.set(key, value)),
  removeItem: vi.fn((key: string) => data.delete(key))
};
const guest: WorkspaceScope = { network: 'testnet', deployment: 'manager-A', wallet: null };
beforeEach(async () => {
  vi.stubGlobal('window', { localStorage });
  data.clear();
  localStorage.setItem.mockImplementation((key, value) => data.set(key, value));
  await useCreateDaoStore.persist.rehydrate();
  useCreateDaoStore.setState({
    ...defaultConfiguration(),
    drafts: [],
    activeDraftId: null,
    imagePreview: null,
    validationErrors: {}
  });
});
describe('durable browser workspace', () => {
  it('does not replace a frozen deployment nonce, deployer, or configuration while updating attempt state', () => {
    const store = useCreateDaoStore.getState();
    const id = store.newDraft(guest);
    const configuration = structuredClone(useCreateDaoStore.getState().drafts[0].configuration);
    const record = {
      nonce: '100',
      deployer: 'wallet-A',
      status: 'prepared' as const,
      configuration,
      configurationFingerprint: 'frozen'
    };
    store.recordDeployment(id, record);
    expect(() => store.recordDeployment(id, { ...record, nonce: '101' })).toThrow('nonce');
    expect(() => store.recordDeployment(id, { ...record, deployer: 'wallet-B' })).toThrow('deployer');
    expect(() =>
      store.recordDeployment(id, {
        ...record,
        configuration: { ...configuration, auction: { ...configuration.auction, reservePrice: '999' } }
      })
    ).toThrow('frozen');
    store.recordDeployment(id, {
      ...record,
      status: 'signed',
      hash: 'attempt',
      signedTxXdr: 'stored envelope',
      expiresAt: 1234
    });
    expect(useCreateDaoStore.getState().drafts[0].deployment).toMatchObject({
      nonce: '100',
      hash: 'attempt',
      status: 'signed'
    });
  });
  it('autosaves multiple independent drafts, step and image preview', async () => {
    const store = useCreateDaoStore.getState();
    const first = store.newDraft(guest);
    store.updateBasicInfo({ tokenName: 'First' });
    store.setImagePreview('data:image/png;base64,AAAA', 'first.png');
    store.setSection('membership');
    const second = store.newDraft(guest);
    store.updateBasicInfo({ tokenName: 'Second' });
    const serialized = data.get(CREATE_WORKSPACE_KEY)!;
    useCreateDaoStore.setState({ drafts: [] });
    data.set(CREATE_WORKSPACE_KEY, serialized);
    await useCreateDaoStore.persist.rehydrate();
    store.resumeDraft(first);
    expect(useCreateDaoStore.getState()).toMatchObject({
      basicInfo: { tokenName: 'First' },
      section: 'membership',
      imagePreview: 'data:image/png;base64,AAAA'
    });
    store.resumeDraft(second);
    expect(useCreateDaoStore.getState().basicInfo.tokenName).toBe('Second');
    expect(useCreateDaoStore.getState().drafts).toHaveLength(2);
    expect(useCreateDaoStore.getState().basicInfo.contractImage).toMatch(/^https:/);
  });
  it('duplicates configuration but never copies a deployment receipt', () => {
    const store = useCreateDaoStore.getState();
    const first = store.newDraft(guest);
    store.updateBasicInfo({ tokenName: 'Original' });
    store.recordDeployment(first, { nonce: '123', deployer: 'wallet-A', status: 'prepared' });
    const second = store.duplicateDraft(first);
    store.resumeDraft(second);
    store.updateBasicInfo({ tokenName: 'Copy edited' });
    expect(useCreateDaoStore.getState().drafts.find((d) => d.id === first)?.configuration.basicInfo.tokenName).toBe(
      'Original'
    );
    expect(useCreateDaoStore.getState().drafts.find((d) => d.id === second)?.deployment).toBeUndefined();
  });
  it('prevents editing or deleting a recovery snapshot, including unknown submitted state', () => {
    const store = useCreateDaoStore.getState();
    const id = store.newDraft(guest);
    store.recordDeployment(id, { nonce: '42', hash: 'abc', deployer: 'wallet-A', status: 'submitted' });
    store.updateAuction({ reservePrice: '999' });
    expect(useCreateDaoStore.getState().auction.reservePrice).toBe('1');
    expect(() => store.deleteDraft(id)).toThrow('recovery');
    expect(useCreateDaoStore.getState().drafts[0].scope.wallet).toBe('wallet-A');
  });
  it('deletes only the selected draft', () => {
    const store = useCreateDaoStore.getState();
    const first = store.newDraft(guest);
    const second = store.newDraft(guest);
    store.deleteDraft(first);
    expect(useCreateDaoStore.getState().drafts.map((d) => d.id)).toEqual([second]);
  });
  it('isolates wallets, managers, and networks while making guest drafts claimable', () => {
    const store = useCreateDaoStore.getState();
    const id = store.newDraft(guest);
    const draft = useCreateDaoStore.getState().drafts[0];
    expect(visibleDraft(draft, { ...guest, wallet: 'wallet-A' })).toBe(true);
    expect(visibleDraft(draft, { ...guest, deployment: 'manager-B' })).toBe(false);
    expect(visibleDraft(draft, { ...guest, network: 'public' })).toBe(false);
    store.recordDeployment(id, { nonce: '1', deployer: 'wallet-A', status: 'prepared' });
    expect(() => store.initialize({ ...guest, wallet: 'wallet-B' }, id)).toThrow('workspace');
    expect(() => store.initialize(guest, id)).toThrow('workspace');
  });
  it('reuses the existing active draft on reload instead of creating duplicates', () => {
    const store = useCreateDaoStore.getState();
    const id = store.initialize(guest);
    expect(store.initialize(guest)).toBe(id);
    expect(useCreateDaoStore.getState().drafts).toHaveLength(1);
  });
  it('never lets a stale tab erase a submitted recovery record or another newly saved draft', () => {
    const store = useCreateDaoStore.getState();
    const id = store.newDraft(guest);
    const stale = structuredClone(useCreateDaoStore.getState().drafts);
    store.recordDeployment(id, { nonce: '123', deployer: 'wallet-A', status: 'submitted', hash: 'preserved-hash' });
    const second = store.newDraft(guest);
    const saved = data.get(CREATE_WORKSPACE_KEY)!;
    useCreateDaoStore.setState({ drafts: stale, activeDraftId: id });
    data.set(CREATE_WORKSPACE_KEY, saved);
    store.updateBasicInfo({ tokenName: 'Stale edit' });
    store.clearAllValidationErrors();
    expect(useCreateDaoStore.getState().drafts.find((d) => d.id === id)?.deployment?.hash).toBe('preserved-hash');
    expect(useCreateDaoStore.getState().drafts.find((d) => d.id === second)).toBeDefined();
    expect(JSON.parse(data.get(CREATE_WORKSPACE_KEY)!).state.drafts).toHaveLength(2);
  });
  it('recovers the independently stored hash after a racing stale autosave overwrites the draft collection', async () => {
    const store = useCreateDaoStore.getState();
    const id = store.newDraft(guest);
    const staleCollection = data.get(CREATE_WORKSPACE_KEY)!;
    store.recordDeployment(id, { nonce: '123', deployer: 'wallet-A', status: 'submitted', hash: 'preserved-hash' });
    data.set(CREATE_WORKSPACE_KEY, staleCollection);
    await useCreateDaoStore.persist.rehydrate();
    expect(useCreateDaoStore.getState().drafts[0].deployment?.hash).toBe('preserved-hash');
    expect(useCreateDaoStore.getState().drafts[0].scope.wallet).toBe('wallet-A');
    expect(() => store.deleteDraft(id)).toThrow('recovery');
  });
  it('resumes the existing wallet draft when switching workspaces rather than creating empty duplicates', () => {
    const store = useCreateDaoStore.getState();
    const a = store.newDraft({ ...guest, wallet: 'wallet-A' });
    store.newDraft({ ...guest, wallet: 'wallet-B' });
    expect(store.initialize({ ...guest, wallet: 'wallet-A' })).toBe(a);
    expect(useCreateDaoStore.getState().drafts).toHaveLength(2);
  });
  it('preserves old identity, governance and membership while separating old data URLs', () => {
    const old = {
      basicInfo: {
        tokenName: 'Preserved',
        description: 'Preserved description',
        contractImage: 'data:image/png;base64,AAAA'
      },
      governance: { proposalThreshold: 8, votingPeriod: 600 },
      purpose: { purpose: 'Old purpose', membershipMode: 'marketplace' },
      launchAdmin: 'wallet-A'
    };
    const migrated = migrateCreationWorkspace(old).drafts[0];
    expect(migrated.configuration).toMatchObject({
      basicInfo: { tokenName: 'Preserved', description: 'Preserved description' },
      governance: { proposalThreshold: 8, votingPeriod: 600, queueDelay: 3600 },
      auction: { enabled: false },
      marketplace: { enabled: true }
    });
    expect(migrated.imagePreview).toBe(old.basicInfo.contractImage);
    expect(migrated.configuration.basicInfo.contractImage).toMatch(/^https:/);
    expect(migrated.scope.wallet).toBe('wallet-A');
    expect('purpose' in migrated.configuration).toBe(false);
    expect(old.purpose.purpose).toBe('Old purpose');
  });
  it('preserves damaged browser data instead of overwriting it with an empty workspace', async () => {
    data.set(CREATE_WORKSPACE_KEY, '{corrupted');
    await useCreateDaoStore.persist.rehydrate();
    useCreateDaoStore.getState().newDraft(guest);
    expect(data.get(CREATE_WORKSPACE_KEY)).toBe('{corrupted');
    expect(assertCreationSaved).toThrow('read local drafts');
  });
  it('blocks signing recovery when autosave exceeds browser quota', () => {
    localStorage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    useCreateDaoStore.getState().newDraft(guest);
    expect(assertCreationSaved).toThrow('Could not save');
  });
});
