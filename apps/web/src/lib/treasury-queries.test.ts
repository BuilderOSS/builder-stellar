import { Asset, nativeToScVal, Networks, StrKey } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ server: vi.fn(), simulate: vi.fn() }));
vi.mock('@stellar/stellar-sdk/rpc', async (original) => ({
  ...(await original<typeof import('@stellar/stellar-sdk/rpc')>()),
  Server: class {
    constructor(url: string, options: unknown) {
      rpc.server(url, options);
    }
    simulateTransaction = rpc.simulate;
  }
}));
import type { DaoNetworkConfig } from './dao-config';
import { fetchTreasuryBalances, formatTreasuryBalance, treasuryBalanceKey } from './treasury-queries';

const treasury = StrKey.encodeContract(new Uint8Array(32).fill(1));
describe('precise treasury balances and network identity', () => {
  beforeEach(() => {
    rpc.server.mockClear();
    rpc.simulate.mockReset();
  });
  it('formats i128 balances without Number rounding', () => {
    expect(formatTreasuryBalance(900719925474099312345n)).toBe('90071992547409.9312345');
    expect(formatTreasuryBalance(0n)).toBe('0.0000000');
  });
  it.each([
    ['public', Networks.PUBLIC, 'https://custom.public/rpc'],
    ['local', 'Standalone Network ; February 2017', 'http://localhost:8000/rpc']
  ] as const)('uses %s RPC, passphrase and native SAC', async (network, passphrase, rpcUrl) => {
    rpc.simulate.mockResolvedValue({
      _parsed: true,
      transactionData: {},
      minResourceFee: '0',
      result: { retval: nativeToScVal(900719925474099312345n, { type: 'i128' }) }
    });
    const result = await fetchTreasuryBalances(['treasury-balances', 'dao1', treasury, network, rpcUrl, passphrase]);
    expect(rpc.server).toHaveBeenCalledWith(rpcUrl, { allowHttp: network === 'local' });
    expect(result[0]?.balance).toBe('90071992547409.9312345');
    const tx = rpc.simulate.mock.calls[0]![0];
    expect(tx.networkPassphrase).toBe(passphrase);
    expect(tx.operations[0].func.toXdrObject().invokeContract.contractAddress.contractId).toEqual(
      StrKey.decodeContract(Asset.native().contractId(passphrase))
    );
  });
  it('rejects failed simulations instead of manufacturing zero balances', async () => {
    rpc.simulate.mockResolvedValue({ _parsed: true, error: 'missing contract', events: [] });
    await expect(
      fetchTreasuryBalances([
        'treasury-balances',
        'dao1',
        treasury,
        'local',
        'http://localhost:8000/rpc',
        'Standalone Network ; February 2017'
      ])
    ).rejects.toThrow('Balance unavailable');
  });
  it('does not mix two DAO or network cache identities', () => {
    const config = {
      tokenContractId: 'dao1',
      treasuryContractId: treasury,
      name: 'testnet',
      rpcUrl: 'rpc1',
      passphrase: Networks.TESTNET
    } as DaoNetworkConfig;
    expect(treasuryBalanceKey(config)).not.toEqual(treasuryBalanceKey({ ...config, tokenContractId: 'dao2' }));
    expect(treasuryBalanceKey(config)).not.toEqual(treasuryBalanceKey({ ...config, name: 'local', rpcUrl: 'rpc2' }));
  });
});
