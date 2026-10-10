import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';

const mocks = vi.hoisted(() => ({
  version: vi.fn(),
  hash: vi.fn(),
  owner: vi.fn(),
  implementation: vi.fn(),
  latest: vi.fn(),
  approved: vi.fn(),
  deployment: vi.fn()
}));
vi.mock('@builder-stellar/token-bindings', () => ({
  Client: class {
    version = mocks.version;
    wasm_hash = mocks.hash;
    get_owner = mocks.owner;
  }
}));
vi.mock('@builder-stellar/manager-bindings', () => ({
  Client: class {
    get_implementation = mocks.implementation;
    get_latest_implementation = mocks.latest;
    is_upgrade_approved = mocks.approved;
  }
}));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: mocks.deployment }));

import { readAdminModuleVersion } from './admin-module-versions';

const config = {
  name: 'testnet',
  rpcUrl: 'https://rpc.example',
  passphrase: 'test',
  tokenContractId: 'token',
  adminAddress: 'admin',
  launchAdmin: 'launch'
} as DaoNetworkConfig;
const from = new Uint8Array(32).fill(1);
const to = new Uint8Array(32).fill(2);
describe('read-only module release and transition checks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.deployment.mockReturnValue({ networkPassphrase: 'test', managerAddress: 'manager' });
    mocks.version.mockResolvedValue({ result: 'v1' });
    mocks.hash.mockResolvedValue({ result: from });
    mocks.owner.mockResolvedValue({ result: 'treasury' });
    mocks.implementation.mockResolvedValue({
      result: { name: 'ActualRegisteredName', version: 'v1', wasm_hash: from, revoked: true }
    });
    mocks.latest.mockResolvedValue({
      result: { name: 'ActualRegisteredName', version: 'v2', wasm_hash: to, revoked: false }
    });
    mocks.approved.mockResolvedValue({ result: true });
  });
  it('reads actual current hash and asks Manager for the actual source name, not a guessed name', async () => {
    const state = await readAdminModuleVersion(config, 'token');
    expect(mocks.implementation).toHaveBeenCalledWith({ wasm_hash: from });
    expect(mocks.latest).toHaveBeenCalledWith({ name: 'ActualRegisteredName' });
    expect(mocks.approved).toHaveBeenCalledWith({ from_hash: from, to_hash: to });
    expect(state.fromHash).toBe('01'.repeat(32));
    expect(state.target?.hash).toBe('02'.repeat(32));
    expect(state.approved).toBe(true); // A revoked source can migrate away.
  });
  it('shows an unapproved transition as unapproved, without a mutation', async () => {
    mocks.approved.mockResolvedValue({ result: false });
    expect((await readAdminModuleVersion(config, 'token')).approved).toBe(false);
  });
  it('does not search guessed names if current hash is unregistered', async () => {
    mocks.implementation.mockResolvedValue({ result: null });
    const state = await readAdminModuleVersion(config, 'token');
    expect(state.target).toBeNull();
    expect(mocks.latest).not.toHaveBeenCalled();
    expect(mocks.approved).not.toHaveBeenCalled();
  });
  it('rejects cross-network Manager use before any module reads', async () => {
    mocks.deployment.mockReturnValue({ networkPassphrase: 'other', managerAddress: 'manager' });
    await expect(readAdminModuleVersion(config, 'token')).rejects.toThrow(/networks do not match/);
    expect(mocks.hash).not.toHaveBeenCalled();
  });
  it('checks an explicitly supplied registered hash without assuming it is approved', async () => {
    await readAdminModuleVersion(config, 'token', null, '03'.repeat(32));
    expect(mocks.implementation).toHaveBeenLastCalledWith({ wasm_hash: new Uint8Array(32).fill(3) });
    expect(mocks.latest).not.toHaveBeenCalled();
  });
});
