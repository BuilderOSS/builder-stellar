import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), raw: vi.fn() }));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'manager:DEPLOYMENT_A' }));
vi.mock('@/lib/dao-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: mocks.config
}));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mocks.raw } }));

import { auctionHistoryScope, historyPagination, readAuctionHistory } from './query';

const row = {
  event_id: 'created:1',
  token_id: '9007199254740993',
  winner: 'GWINNER',
  amount: '90071992547409931234567',
  payment_token: 'CHISTORIC_PAY',
  settled: true,
  cancelled: false,
  settled_at: new Date('2026-10-01T00:00:00Z'),
  transaction_hash: 'settled-hash'
};

describe('scoped auction history read', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockResolvedValue({ tokenContractId: 'DAO_A', auctionContractId: 'AUCTION_A', name: 'testnet' });
    mocks.raw.mockResolvedValue([row]);
  });
  it('reads existing scoped views, joins settlement identity, and keeps exact strings', async () => {
    const result = await readAuctionHistory('url-dao', new URLSearchParams('limit=1&offset=12&network=testnet'));
    expect(result).toMatchObject({
      deploymentId: 'manager:DEPLOYMENT_A',
      daoId: 'DAO_A',
      contractId: 'AUCTION_A',
      limit: 1,
      offset: 12,
      hasMore: false
    });
    expect(result.items[0]).toMatchObject({
      tokenId: row.token_id,
      amount: row.amount,
      winningBidder: 'GWINNER',
      paymentToken: 'CHISTORIC_PAY',
      outcome: 'sold',
      transactionHash: 'settled-hash'
    });
    const [parts, ...values] = mocks.raw.mock.calls[0];
    expect(values).toEqual(['manager:DEPLOYMENT_A', 'DAO_A', 'AUCTION_A', 2, 12]);
    const sql = parts.join('?');
    expect(sql).toContain('s.deployment_id = a.deployment_id AND s.dao_id = a.dao_id');
    expect(sql).toContain('s.contract_id = a.contract_id AND s.token_id = a.token_id');
    expect(sql).toContain('a.deployment_id = ? AND a.dao_id = ?');
    expect(sql).toContain('a.contract_id = ?');
    expect(sql).toContain('a.token_id::text');
    expect(sql).toContain('s.amount::text');
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/);
  });
  it('does not leak scope across two DAOs, networks or deployment identities', async () => {
    await readAuctionHistory('DAO_A', new URLSearchParams());
    mocks.config.mockResolvedValue({ tokenContractId: 'DAO_B', auctionContractId: 'AUCTION_B', name: 'public' });
    const second = await readAuctionHistory('DAO_B', new URLSearchParams('network=public'));
    expect(second.daoId).toBe('DAO_B');
    expect(mocks.raw.mock.calls[1].slice(1, 4)).toEqual(['manager:DEPLOYMENT_A', 'DAO_B', 'AUCTION_B']);
    expect(auctionHistoryScope('manager:DEPLOYMENT_B', 'DAO_B', 'AUCTION_B')).toEqual({
      deploymentId: 'manager:DEPLOYMENT_B',
      daoId: 'DAO_B',
      contractId: 'AUCTION_B'
    });
    await expect(readAuctionHistory('DAO_B', new URLSearchParams('network=testnet'))).rejects.toThrow('network');
    expect(mocks.raw).toHaveBeenCalledTimes(2);
  });
  it('paginates with one lookahead and labels unsold/cancelled without inventing a winner or zero price', async () => {
    mocks.raw.mockResolvedValue([
      { ...row, winner: null, amount: '0' },
      { ...row, event_id: 'cancelled', settled: false, cancelled: true, winner: null, amount: null, settled_at: null }
    ]);
    const first = await readAuctionHistory('DAO_A', new URLSearchParams('limit=1'));
    expect(first.hasMore).toBe(true);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ outcome: 'unsold', winningBidder: null, amount: '0' });
    const both = await readAuctionHistory('DAO_A', new URLSearchParams());
    expect(both.items[1]).toMatchObject({ outcome: 'cancelled', amount: null });
  });
  it('fails closed for missing identity, malformed pages and incomplete settlement rows', async () => {
    for (const scope of [
      ['', 'DAO', 'AUCTION'],
      ['DEPLOYMENT', '', 'AUCTION'],
      ['DEPLOYMENT', 'DAO', '']
    ])
      expect(() => auctionHistoryScope(...(scope as [string, string, string]))).toThrow('identity');
    for (const query of ['limit=0', 'limit=51', 'limit=-1', 'offset=1e3', 'offset=100001', 'offset=1.5'])
      expect(() => historyPagination(new URLSearchParams(query))).toThrow('pagination');
    mocks.config.mockResolvedValue({ tokenContractId: '', auctionContractId: 'AUCTION', name: 'testnet' });
    await expect(readAuctionHistory('bad', new URLSearchParams())).rejects.toThrow('identity');
    expect(mocks.raw).not.toHaveBeenCalled();
    mocks.config.mockResolvedValue({ tokenContractId: 'DAO', auctionContractId: 'AUCTION', name: 'testnet' });
    mocks.raw.mockResolvedValue([{ ...row, amount: null }]);
    await expect(readAuctionHistory('DAO', new URLSearchParams())).rejects.toThrow('incomplete');
  });
});
