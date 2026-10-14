import { Account, Address, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  transfer: vi.fn(),
  approve: vi.fn(),
  delegate: vi.fn(),
  scope: vi.fn(),
  latest: vi.fn(),
  balance: vi.fn(),
  votes: vi.fn(),
  delegation: vi.fn(),
  Client: vi.fn(),
  network: vi.fn(),
  settings: vi.fn(),
  modules: vi.fn()
}));
vi.mock('@builder-stellar/token-bindings', () => ({
  Client: class {
    constructor(options: unknown) {
      mocks.Client(options);
    }
    owner_of = mocks.owner;
    transfer = mocks.transfer;
    approve = mocks.approve;
    delegate = mocks.delegate;
    balance = mocks.balance;
    get_votes = mocks.votes;
    get_delegate = mocks.delegation;
    settings = mocks.settings;
    modules = mocks.modules;
  }
}));
vi.mock('@stellar/stellar-sdk', async (original) => ({
  ...(await original<typeof import('@stellar/stellar-sdk')>()),
  rpc: {
    Server: class {
      getLatestLedger = mocks.latest;
    }
  }
}));
vi.mock('@/lib/member-directory/query', () => ({ directoryScope: mocks.scope }));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: mocks.network }));

import { holderActionSchema, prepareHolderAction } from './actions';
import { missingTokenRead } from './read-test-fixtures';

describe('holder binding actions', () => {
  const owner = Keypair.random().publicKey();
  const destination = Keypair.random().publicKey();
  const actor = { address: owner, network: 'testnet' };
  const treasury = Address.contract(Keypair.random().rawPublicKey()).toString();
  const vault = Address.contract(Keypair.random().rawPublicKey()).toString();
  const switches = (on: Partial<Record<'transfers_locked' | 'members_only_delegation', boolean>> = {}) =>
    mocks.settings.mockResolvedValue({
      simulationData: {},
      result: { transfers_locked: false, members_only_delegation: false, dao_recovery: false, ...on }
    });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.network.mockReturnValue({ name: 'testnet', networkPassphrase: Networks.TESTNET });
    mocks.scope.mockResolvedValue({
      deploymentId: 'dep-a',
      daoId: 'token-a',
      config: {
        name: 'testnet',
        passphrase: Networks.TESTNET,
        rpcUrl: 'https://rpc.example',
        tokenContractId: 'token-a',
        treasuryContractId: treasury
      }
    });
    switches();
    mocks.modules.mockResolvedValue({
      simulationData: {},
      result: [{ kind: 'marketplace', address: vault, non_voting: true }]
    });
    mocks.owner.mockResolvedValue({ simulationData: {}, result: owner });
    mocks.latest.mockResolvedValue({ sequence: 1000 });
    mocks.balance.mockResolvedValue({ simulationData: {}, result: 3 });
    mocks.votes.mockResolvedValue({ simulationData: {}, result: 9007199254740993n });
    mocks.delegation.mockResolvedValue({ simulationData: {}, result: owner });
    const envelope = new TransactionBuilder(new Account(owner, '0'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET
    })
      .setTimeout(180)
      .build();
    const tx = { simulationData: {}, needsNonInvokerSigningBy: () => [], toXdr: () => envelope.toXDR() };
    for (const fn of [mocks.transfer, mocks.approve, mocks.delegate]) fn.mockResolvedValue(tx);
  });
  it('uses the authenticated actor and u32 token ID for transfer', async () => {
    const result = await prepareHolderAction('dao-a', actor, {
      action: 'transfer',
      tokenId: '4294967295',
      destination
    });
    expect(mocks.owner).toHaveBeenCalledWith({ token_id: 4294967295 });
    expect(mocks.transfer).toHaveBeenCalledWith(
      { from: owner, to: destination, token_id: 4294967295 },
      { timeoutInSeconds: 180 }
    );
    expect(result.address).toBe(owner);
    expect(result.deploymentId).toBe('dep-a');
    expect(result.daoId).toBe('token-a');
  });
  it('stops before assembly when ownership changed', async () => {
    mocks.owner.mockResolvedValue({ simulationData: {}, result: destination });
    await expect(
      prepareHolderAction('dao-a', actor, { action: 'transfer', tokenId: '0', destination })
    ).rejects.toThrow('no longer own');
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it('checks network before owner lookup', async () => {
    await expect(
      prepareHolderAction('dao-a', { ...actor, network: 'public' }, { action: 'revoke', tokenId: '0' })
    ).rejects.toThrow('network');
    expect(mocks.owner).not.toHaveBeenCalled();
  });
  it('approves exactly one token to a future u32 ledger and rejects expired approval', async () => {
    await prepareHolderAction('dao-a', actor, {
      action: 'approve',
      tokenId: '0',
      destination,
      expirationLedger: '1120'
    });
    expect(mocks.approve).toHaveBeenCalledWith(
      { owner, spender: destination, token_id: 0, expiration_ledger: 1120 },
      { timeoutInSeconds: 180 }
    );
    await expect(
      prepareHolderAction('dao-a', actor, { action: 'approve', tokenId: '0', destination, expirationLedger: '1000' })
    ).rejects.toThrow('end in the future');
    expect(mocks.approve).toHaveBeenCalledTimes(1);
  });
  it('revokes using pinned approval semantics without a nonexistent getter or revoke method', async () => {
    await prepareHolderAction('dao-a', actor, { action: 'revoke', tokenId: '0' });
    expect(mocks.approve).toHaveBeenCalledWith(
      { owner, spender: owner, token_id: 0, expiration_ledger: 0 },
      { timeoutInSeconds: 180 }
    );
  });
  it('self-delegates the account (not the token) and keeps exact votes in review', async () => {
    const result = await prepareHolderAction('dao-a', actor, { action: 'delegate', tokenId: '0', destination: owner });
    expect(mocks.delegate).toHaveBeenCalledWith({ account: owner, delegatee: owner }, { timeoutInSeconds: 180 });
    expect(result.summary).toContain('9007199254740993');
    expect(result.summary).toContain('all 3 tokens');
  });
  it('rejects body-supplied identity, invalid addresses and out-of-range IDs', () => {
    expect(holderActionSchema.safeParse({ action: 'revoke', tokenId: '0', address: destination }).success).toBe(false);
    expect(holderActionSchema.safeParse({ action: 'transfer', tokenId: '0', destination: 'bad' }).success).toBe(false);
    expect(holderActionSchema.safeParse({ action: 'revoke', tokenId: '4294967296' }).success).toBe(false);
  });
  it('cannot return an XDR from failed simulation', async () => {
    mocks.transfer.mockResolvedValue({
      get simulationData() {
        throw new Error('simulation failed');
      },
      toXdr: vi.fn()
    });
    await expect(
      prepareHolderAction('dao-a', actor, { action: 'transfer', tokenId: '0', destination })
    ).rejects.toThrow('simulation failed');
  });
  it.each(['transfer', 'approve', 'revoke', 'delegate'] as const)(
    'blocks %s on a fulfilled SDK contract-error owner read',
    async (action) => {
      mocks.owner.mockResolvedValue(await missingTokenRead());
      await expect(
        prepareHolderAction('dao-a', actor, {
          action,
          tokenId: '0',
          destination,
          expirationLedger: '1120'
        })
      ).rejects.toThrow('simulation failed');
      expect(mocks.transfer).not.toHaveBeenCalled();
      expect(mocks.approve).not.toHaveBeenCalled();
      expect(mocks.delegate).not.toHaveBeenCalled();
    }
  );
  it.each(['balance', 'votes', 'delegation'] as const)(
    'blocks delegation when the %s read fulfills with a contract error',
    async (field) => {
      mocks[field].mockResolvedValue(await missingTokenRead());
      await expect(
        prepareHolderAction('dao-a', actor, { action: 'delegate', tokenId: '0', destination })
      ).rejects.toThrow('simulation failed');
      expect(mocks.delegate).not.toHaveBeenCalled();
    }
  );
  it('on a locked DAO, transfers only back to the Treasury and approves only the Treasury', async () => {
    switches({ transfers_locked: true });
    await expect(
      prepareHolderAction('dao-a', actor, { action: 'transfer', tokenId: '0', destination })
    ).rejects.toThrow('locked');
    await expect(
      prepareHolderAction('dao-a', actor, { action: 'approve', tokenId: '0', destination, expirationLedger: '1120' })
    ).rejects.toThrow('only approve the tribe Treasury');
    expect(mocks.transfer).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
    const back = await prepareHolderAction('dao-a', actor, { action: 'transfer', tokenId: '0', destination: treasury });
    expect(mocks.transfer).toHaveBeenCalledWith({ from: owner, to: treasury, token_id: 0 }, { timeoutInSeconds: 180 });
    expect(back.summary).toContain('back to the tribe Treasury');
    const approval = await prepareHolderAction('dao-a', actor, {
      action: 'approve',
      tokenId: '0',
      destination: treasury,
      expirationLedger: '1120'
    });
    expect(approval.summary).toContain('so a proposal members pass can move it');
  });
  it('with members-only delegation, delegates only to someone who holds a voting token', async () => {
    switches({ members_only_delegation: true });
    mocks.balance.mockImplementation(async ({ account }: { account: string }) => ({
      simulationData: {},
      result: account === destination || account === vault ? 2 : account === owner ? 3 : 0
    }));
    await prepareHolderAction('dao-a', actor, { action: 'delegate', tokenId: '0', destination });
    expect(mocks.delegate).toHaveBeenCalledTimes(1);
    for (const other of [treasury, vault, Keypair.random().publicKey()])
      await expect(
        prepareHolderAction('dao-a', actor, { action: 'delegate', tokenId: '0', destination: other })
      ).rejects.toThrow('only lets you delegate to members');
    expect(mocks.delegate).toHaveBeenCalledTimes(1);
    await prepareHolderAction('dao-a', actor, { action: 'delegate', tokenId: '0', destination: owner });
    expect(mocks.delegate).toHaveBeenCalledTimes(2);
  });
});
