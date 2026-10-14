import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  outcome: null as 'open' | 'launched' | 'released' | null,
  deadline: vi.fn(async (_daoId: string): Promise<number | null> => 1_900_000_000)
}));

vi.mock('./dao-db', () => ({
  resolveDaoId: async (id: string) => id,
  getDaoConfigFromDatabase: async (daoId: string) => ({
    dao_id: daoId,
    token_address: daoId,
    network: 'testnet',
    governor_contract: 'CGOV',
    status: 'pending',
    profile: { description: '', links: [], image: '' },
    profile_status: 'verified',
    profile_seq: 0,
    image: '',
    assurance_outcome: db.outcome
  }),
  getTokenSettingsFromDatabase: async () => ({
    transfersLocked: false,
    membersOnlyDelegation: false,
    daoRecovery: false
  }),
  getAssuranceDeadlineFromDatabase: db.deadline
}));

import { type DaoNetworkConfig, getDaoNetworkConfigById, isDaoAdmin } from './dao-config';

const config = (status: DaoNetworkConfig['status']): DaoNetworkConfig => ({
  name: 'testnet',
  label: '',
  rpcUrl: '',
  passphrase: '',
  tokenName: '',
  tokenSymbol: '',
  profile: { description: '', links: [], image: '' },
  profileStatus: 'verified',
  profileSeq: 0,
  adminAddress: 'GOWNER',
  launchAdmin: 'GLAUNCH',
  tokenContractId: '',
  metadataContractId: '',
  image: '',
  governorContractId: '',
  treasuryContractId: '',
  auctionContractId: '',
  marketplaceContractId: '',
  claimsContractId: '',
  tokenSettings: { transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false },
  assuranceOutcome: null,
  assuranceDeadline: null,
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

describe('getDaoNetworkConfigById', () => {
  it('carries the launch drive deadline so pages can tell when the drive ended', async () => {
    db.outcome = 'open';
    const config = await getDaoNetworkConfigById('CDRIVE');
    expect(config.assuranceOutcome).toBe('open');
    expect(config.assuranceDeadline).toBe(1_900_000_000);
    expect(db.deadline).toHaveBeenCalledWith('CDRIVE');
  });

  it('skips the deadline read for a DAO that never opened a drive', async () => {
    db.outcome = null;
    db.deadline.mockClear();
    const config = await getDaoNetworkConfigById('CNODRIVE');
    expect(config.assuranceDeadline).toBeNull();
    expect(db.deadline).not.toHaveBeenCalled();
  });
});
