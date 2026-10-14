import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  releaseSlug: vi.fn(),
  managerOptions: vi.fn(),
  sendAndConfirm: vi.fn(),
  walletClientOptions: vi.fn()
}));

vi.mock('@builder-stellar/manager-bindings', () => ({
  Client: class {
    constructor(options: unknown) {
      mocks.managerOptions(options);
    }
    release_slug = mocks.releaseSlug;
  }
}));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: () => ({ managerAddress: 'CMANAGER' }) }));
vi.mock('@/lib/minter/direct', () => ({
  walletClientOptions: mocks.walletClientOptions,
  sendAndConfirm: mocks.sendAndConfirm
}));

import type { DaoNetworkConfig } from '@/lib/dao-config';

import { releaseDriveSlug } from './release-slug';

const config = { tokenContractId: 'CTOKEN', rpcUrl: 'https://rpc.test' } as DaoNetworkConfig;

describe('releaseDriveSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.walletClientOptions.mockReturnValue({ contractId: 'CMANAGER', publicKey: 'GWALLET' });
    mocks.releaseSlug.mockResolvedValue('assembled');
    mocks.sendAndConfirm.mockResolvedValue('abc123');
  });

  it('has the connected wallet sign Manager.release_slug for this tribe’s token, then waits for it', async () => {
    await expect(releaseDriveSlug(config, 'GWALLET')).resolves.toBe('abc123');
    expect(mocks.walletClientOptions).toHaveBeenCalledWith(config, 'GWALLET', 'CMANAGER');
    expect(mocks.managerOptions).toHaveBeenCalledWith({ contractId: 'CMANAGER', publicKey: 'GWALLET' });
    expect(mocks.releaseSlug).toHaveBeenCalledWith({ token_address: 'CTOKEN' });
    expect(mocks.sendAndConfirm).toHaveBeenCalledWith('assembled', 'https://rpc.test');
  });

  it('sends nothing when the simulation fails', async () => {
    mocks.releaseSlug.mockRejectedValue(new Error('Error(Contract, #7142)'));
    await expect(releaseDriveSlug(config, 'GWALLET')).rejects.toThrow('#7142');
    expect(mocks.sendAndConfirm).not.toHaveBeenCalled();
  });
});
