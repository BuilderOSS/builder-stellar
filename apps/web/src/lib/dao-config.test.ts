import { describe, expect, it } from 'vitest';

import { type DaoNetworkConfig, isDaoAdmin } from './dao-config';

const config = (status: DaoNetworkConfig['status']): DaoNetworkConfig => ({
  name: 'testnet',
  label: '',
  rpcUrl: '',
  passphrase: '',
  tokenName: '',
  tokenSymbol: '',
  tokenDescription: '',
  adminAddress: 'GOWNER',
  launchAdmin: 'GLAUNCH',
  tokenContractId: '',
  metadataContractId: '',
  contractImage: '',
  governorContractId: '',
  treasuryContractId: '',
  auctionContractId: '',
  marketplaceContractId: '',
  auctionEnabled: null,
  auctionPaused: null,
  marketplaceEnabled: null,
  status
});

describe('isDaoAdmin', () => {
  it('allows the launch admin to manage a pending DAO', () => {
    expect(isDaoAdmin(config('pending'), 'glaunch')).toBe(true);
  });

  it('does not grant pending access to another address', () => {
    expect(isDaoAdmin(config('pending'), 'GOTHER')).toBe(false);
  });

  it('does not preserve launch-admin access after launch', () => {
    expect(isDaoAdmin(config('operational'), 'GLAUNCH')).toBe(false);
    expect(isDaoAdmin(config('operational'), 'gowner')).toBe(false);
  });
});
