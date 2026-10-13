import { StrKey } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ module: vi.fn(), config: vi.fn() }));
vi.mock('@builder-stellar/token-bindings', () => ({
  Client: class {
    module = mocks.module;
    is_live = async () => ({ simulationData: {}, result: true });
    admin = async () => ({ simulationData: {}, result: mocks.config().treasuryContractId });
    mint_allowance = async () => ({ simulationData: {}, result: 0 });
  }
}));
vi.mock('@/lib/dao-config', async (original) => ({
  ...(await original<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: async () => mocks.config()
}));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({
    name: mocks.config().name,
    networkPassphrase: mocks.config().passphrase,
    rpcUrl: mocks.config().rpcUrl
  })
}));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));
vi.mock('@/lib/goldsky', () => ({ getGoldskyClaims: vi.fn() }));

import { currentClaims } from './service';
import { config, TOKEN } from './test-fixtures';

describe('currentClaims', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockReturnValue(config);
  });

  it('refuses a claims module the index does not list as Manager-deployed', async () => {
    const outside = StrKey.encodeContract(Buffer.alloc(32, 9));
    mocks.module.mockResolvedValue({ simulationData: {}, result: outside });
    await expect(currentClaims(TOKEN, null)).rejects.toThrow('the platform did not deploy');
  });

  it('reads no lists when the community has no claims module', async () => {
    mocks.config.mockReturnValue({ ...config, claimsContractId: '' });
    mocks.module.mockResolvedValue({ simulationData: {}, result: null });
    const state = await currentClaims(TOKEN, null);
    expect(state.claimsContractId).toBeNull();
    expect(state.lists).toEqual([]);
  });
});
