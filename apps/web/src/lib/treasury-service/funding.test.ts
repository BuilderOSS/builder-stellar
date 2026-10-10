import { Account, Asset, Contract, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  scope: vi.fn(),
  readiness: vi.fn(),
  governor: vi.fn(),
  transfer: vi.fn(),
  from: vi.fn(),
  treasuryOptions: vi.fn(),
  network: 'testnet'
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/treasury-service/service', async (original) => ({
  ...(await original<typeof import('./service')>()),
  treasuryScope: mock.scope
}));
vi.mock('@builder-stellar/treasury-bindings', () => ({
  Client: class {
    constructor(options: unknown) {
      mock.treasuryOptions(options);
    }
    governor = mock.governor;
  }
}));
vi.mock('@stellar/stellar-sdk', async (original) => {
  const sdk = await original<typeof import('@stellar/stellar-sdk')>();
  return { ...sdk, contract: { ...sdk.contract, Client: { from: mock.from } } };
});
vi.mock('@/lib/marketplace/readiness', () => ({ marketplaceReadiness: mock.readiness }));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({
    name: mock.network,
    rpcUrl: mock.network === 'local' ? 'http://localhost:8000/rpc' : 'https://soroban-testnet.stellar.org',
    networkPassphrase:
      mock.network === 'local' ? 'Standalone Network ; February 2017' : 'Test SDF Network ; September 2015'
  })
}));

import { assertFundingFunds, prepareTreasuryFunding, treasuryReadiness } from './funding';
import type { TreasuryReadiness } from './types';

const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const treasury = Asset.native().contractId(Networks.TESTNET);
const scope = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  treasuryContractId: treasury,
  governorContractId: 'governor-a'
};
const funds: TreasuryReadiness['account'] = {
  address,
  paymentAsset: treasury,
  assetCode: 'XLM',
  balance: '1000000000',
  available: '500000000',
  nativeAvailable: '500000000',
  receivable: null,
  trustline: true,
  authorized: true,
  issues: [],
  canAddTrustline: false
};
const xdr = new TransactionBuilder(new Account(address, '1'), { fee: '1234', networkPassphrase: Networks.TESTNET })
  .addOperation(new Contract(treasury).call('balance'))
  .setTimeout(180)
  .build()
  .toXDR();

beforeEach(() => {
  vi.clearAllMocks();
  mock.network = 'testnet';
  mock.scope.mockResolvedValue(scope);
  mock.readiness.mockResolvedValue(funds);
  mock.governor.mockResolvedValue({ result: 'governor-a' });
  mock.from.mockResolvedValue({ transfer: mock.transfer });
  mock.transfer.mockResolvedValue({ simulationData: {}, needsNonInvokerSigningBy: () => [], toXdr: () => xdr });
});

describe('treasury preparation, SAC identity and funding readiness', () => {
  it('builds exactly one unsigned SAC transfer from the server actor to registered treasury', async () => {
    const result = await prepareTreasuryFunding(
      'dao-a',
      { address, network: 'testnet' },
      { assetCode: 'XLM', amount: '1.0000001' }
    );
    expect(mock.transfer).toHaveBeenCalledWith(
      { from: address, to: treasury, amount: 10000001n },
      { timeoutInSeconds: 180 }
    );
    expect(mock.from).toHaveBeenCalledWith({
      contractId: treasury,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      publicKey: address,
      allowHttp: false
    });
    expect(mock.treasuryOptions.mock.calls[0][0]).not.toHaveProperty('signTransaction');
    expect(TransactionBuilder.fromXDR(result.xdr, Networks.TESTNET).signatures).toHaveLength(0);
    expect(result).toMatchObject({ ...scope, address, amount: '1.0000001', fee: '1234' });
    expect(mock.readiness).toHaveBeenCalledTimes(2);
  });
  it('never uses the testnet placeholder for local native SAC', async () => {
    mock.network = 'local';
    const local = await treasuryReadiness('dao-a', { address, network: 'local' }, 'XLM');
    expect(local.assetContractId).toBe(Asset.native().contractId('Standalone Network ; February 2017'));
    expect(local.assetContractId).not.toBe(treasury);
    await expect(treasuryReadiness('dao-a', { address, network: 'local' }, 'USDC')).rejects.toThrow('not supported');
  });
  it('requires the configured network, session account and live governor wiring', async () => {
    await expect(treasuryReadiness('dao-a', { address, network: 'public' }, 'XLM')).rejects.toThrow('Authenticate');
    await expect(treasuryReadiness('dao-a', { address: 'spoofed', network: 'testnet' }, 'XLM')).rejects.toThrow(
      'Authenticate'
    );
    expect(mock.scope).not.toHaveBeenCalled();
    mock.governor.mockResolvedValue({ result: 'other-governor' });
    await expect(
      prepareTreasuryFunding('dao-a', { address, network: 'testnet' }, { assetCode: 'XLM', amount: '1' })
    ).rejects.toThrow('governor');
    expect(mock.transfer).not.toHaveBeenCalled();
  });
  it('does not return an envelope from a failed simulation or unexpected extra signer', async () => {
    mock.transfer.mockResolvedValue({
      get simulationData() {
        throw new Error('Simulation failed');
      },
      toXdr: () => xdr
    });
    await expect(
      prepareTreasuryFunding('dao-a', { address, network: 'testnet' }, { assetCode: 'XLM', amount: '1' })
    ).rejects.toThrow('Simulation');
    mock.transfer.mockResolvedValue({
      simulationData: {},
      needsNonInvokerSigningBy: () => [address],
      toXdr: () => xdr
    });
    await expect(
      prepareTreasuryFunding('dao-a', { address, network: 'testnet' }, { assetCode: 'XLM', amount: '1' })
    ).rejects.toThrow('another account');
  });
  it('rechecks fee funds after simulation and rejects liabilities changing mid-review', async () => {
    mock.readiness.mockResolvedValueOnce(funds).mockResolvedValueOnce({ ...funds, nativeAvailable: '1233' });
    await expect(
      prepareTreasuryFunding('dao-a', { address, network: 'testnet' }, { assetCode: 'XLM', amount: '1' })
    ).rejects.toThrow('network fee');
  });
  it('refuses an unsigned envelope with a source other than the authenticated actor', async () => {
    const { StrKey } = await import('@stellar/stellar-sdk');
    const other = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
    const foreign = new TransactionBuilder(new Account(other, '1'), {
      fee: '1234',
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(new Contract(treasury).call('balance'))
      .setTimeout(180)
      .build()
      .toXDR();
    mock.transfer.mockResolvedValue({ simulationData: {}, needsNonInvokerSigningBy: () => [], toXdr: () => foreign });
    await expect(
      prepareTreasuryFunding('dao-a', { address, network: 'testnet' }, { assetCode: 'XLM', amount: '1' })
    ).rejects.toThrow('Unexpected transaction source');
  });
  it('does not turn unavailable readiness into a zero balance', async () => {
    mock.readiness.mockRejectedValue(new Error('Account read unavailable'));
    await expect(treasuryReadiness('dao-a', { address, network: 'testnet' }, 'XLM')).rejects.toThrow('unavailable');
    expect(mock.transfer).not.toHaveBeenCalled();
  });
  it('adds XLM fee to native transfer only, preserving one-stroop boundaries', () => {
    const exact = { ...funds, available: '9007199254740993', nativeAvailable: '9007199254740993' };
    expect(() => assertFundingFunds(exact, 9007199254740893n, 100n, true)).not.toThrow();
    expect(() => assertFundingFunds(exact, 9007199254740894n, 100n, true)).toThrow('Insufficient');
    expect(() => assertFundingFunds(exact, 9007199254740993n, 100n, false)).not.toThrow();
    expect(() => assertFundingFunds({ ...exact, authorized: false }, 1n, 100n, false)).toThrow('authorized');
    expect(() => assertFundingFunds({ ...exact, trustline: false }, 1n, 100n, false)).toThrow('trustline');
  });
});
