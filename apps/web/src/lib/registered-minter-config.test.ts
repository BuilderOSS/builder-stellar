import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getNetworkConfig } from '@/config/networks';
import { MINTER, minterSpec } from '@/lib/minter/test-fixtures';

const calls = vi.hoisted(() => ({ registration: vi.fn(), manager: vi.fn(), minter: vi.fn() }));
vi.mock('@builder-stellar/manager-bindings', () => ({
  Client: class {
    constructor(options: unknown) {
      calls.manager(options);
    }
    get_platform_minter = calls.registration;
  }
}));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({
    name: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    managerAddress: 'canonical-manager'
  })
}));
vi.mock('@/lib/minter/client', () => ({ minterClient: calls.minter }));
import { registeredMinterConfig } from './registered-minter-config';

describe('server-discovered platform Minter', () => {
  beforeEach(() => {
    calls.registration.mockReset();
    calls.minter.mockReset();
    calls.manager.mockClear();
  });
  it('uses the canonical manager and fetches the spec for only its registration', async () => {
    calls.registration.mockResolvedValue({ result: MINTER });
    calls.minter.mockResolvedValue({ spec: minterSpec() });
    expect(await registeredMinterConfig(getNetworkConfig('testnet'), 'source')).toMatchObject({
      minterContractId: MINTER,
      minterSpec: expect.any(Array)
    });
    expect(calls.manager).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'canonical-manager' }));
    expect(calls.minter).toHaveBeenCalledWith(expect.objectContaining({ contractId: MINTER }));
  });
  it('does not invent a minter or use another network on missing/incompatible registration', async () => {
    calls.registration.mockResolvedValue({ result: null });
    expect(await registeredMinterConfig(getNetworkConfig('testnet'), 'source')).toMatchObject({ minterContractId: '' });
    expect(calls.minter).not.toHaveBeenCalled();
    await expect(registeredMinterConfig(getNetworkConfig('public'), 'source')).rejects.toThrow(/network mismatch/);
    calls.registration.mockResolvedValue({ result: 'not-a-contract' });
    await expect(registeredMinterConfig(getNetworkConfig('testnet'), 'source')).rejects.toThrow(/Invalid/);
    calls.registration.mockResolvedValue({ result: MINTER });
    calls.minter.mockRejectedValue(new Error('ABI incompatible'));
    await expect(registeredMinterConfig(getNetworkConfig('testnet'), 'source')).rejects.toThrow(/ABI incompatible/);
  });
});
