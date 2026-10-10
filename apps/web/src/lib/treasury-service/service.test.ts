import { StrKey } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ raw: vi.fn(), dao: vi.fn() }));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mock.raw, managerDao: { findFirst: mock.dao } } }));

import { indexedTreasuryHistory, type TreasuryCallRow, treasuryScope } from './service';

const contract = (seed: number) => StrKey.encodeContract(Buffer.alloc(32, seed));
const scope = {
  deploymentId: 'deployment-a',
  daoId: contract(1),
  treasuryContractId: contract(2),
  governorContractId: contract(3)
};
const row: TreasuryCallRow = {
  deployment_id: scope.deploymentId,
  dao_id: scope.daoId,
  contract_id: scope.treasuryContractId,
  governor: scope.governorContractId,
  event_id: 'event-1',
  proposal_id: Buffer.alloc(32, 7).toString('base64'),
  call_index: 0,
  target: contract(4),
  function: 'transfer',
  event_ledger: 999n,
  event_at: new Date('2026-01-01'),
  transaction_hash: 'a'.repeat(64)
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.raw.mockResolvedValue([row]);
  mock.dao.mockResolvedValue({
    deploymentId: scope.deploymentId,
    daoId: scope.daoId,
    tokenContract: scope.daoId,
    tokenAddress: scope.daoId,
    treasuryContract: scope.treasuryContractId,
    governorContract: scope.governorContractId
  });
});

describe('treasury read-only indexed tenant isolation', () => {
  it('resolves authoritative contracts only inside the configured deployment', async () => {
    expect(await treasuryScope(scope.daoId)).toEqual(scope);
    expect(mock.dao).toHaveBeenCalledWith({ where: { deploymentId: 'deployment-a', daoId: scope.daoId } });
  });
  it('fails closed for a missing registry, token mismatch, or missing treasury', async () => {
    mock.dao.mockResolvedValueOnce(null);
    await expect(treasuryScope(scope.daoId)).rejects.toThrow('not found');
    mock.dao.mockResolvedValueOnce({
      deploymentId: scope.deploymentId,
      daoId: scope.daoId,
      tokenContract: contract(9)
    });
    await expect(treasuryScope(scope.daoId)).rejects.toThrow('identity');
    await expect(treasuryScope('untrusted-sql')).rejects.toThrow('identifier');
  });
  it('parameterizes all four identities and pagination in the existing view', async () => {
    const result = await indexedTreasuryHistory(scope, 2);
    const [sql, ...bound] = mock.raw.mock.calls[0];
    expect(sql.join('?')).toContain('FROM treasury.calls');
    expect(sql.join('?')).toMatch(/deployment_id = \?.*dao_id = \?/s);
    expect(sql.join('?')).toMatch(/contract_id = \?.*governor = \?/s);
    expect(bound).toEqual([scope.deploymentId, scope.daoId, scope.treasuryContractId, scope.governorContractId, 24]);
    expect(sql.join('?')).not.toContain(scope.daoId);
    expect(result.calls[0]).toMatchObject({
      ledger: '999',
      proposalId: '07'.repeat(32),
      transactionHash: 'a'.repeat(64)
    });
  });
  it.each(['deployment_id', 'dao_id', 'contract_id', 'governor'])(
    'rejects foreign %s rows even if a database adapter returns them',
    async (field) => {
      mock.raw.mockResolvedValue([{ ...row, [field]: 'foreign' }]);
      await expect(indexedTreasuryHistory(scope, 0)).rejects.toThrow('identity mismatch');
    }
  );
  it('keeps two deployments and DAOs isolated, including pages', async () => {
    const second = {
      deploymentId: 'deployment-b',
      daoId: contract(8),
      treasuryContractId: contract(9),
      governorContractId: contract(10)
    };
    await indexedTreasuryHistory(scope, 0);
    mock.raw.mockResolvedValue([
      {
        ...row,
        deployment_id: second.deploymentId,
        dao_id: second.daoId,
        contract_id: second.treasuryContractId,
        governor: second.governorContractId
      }
    ]);
    expect(await indexedTreasuryHistory(second, 1)).toMatchObject(second);
    expect(mock.raw.mock.calls[1].slice(1)).toEqual([
      second.deploymentId,
      second.daoId,
      second.treasuryContractId,
      second.governorContractId,
      12
    ]);
    await expect(indexedTreasuryHistory(scope, 1)).rejects.toThrow('identity');
  });
  it('uses a lookahead row, reports empty history, and never queries with missing identity', async () => {
    mock.raw.mockResolvedValue(Array.from({ length: 13 }, (_, i) => ({ ...row, event_id: `event-${i}` })));
    const page = await indexedTreasuryHistory(scope, 0);
    expect(page.calls).toHaveLength(12);
    expect(page.hasMore).toBe(true);
    mock.raw.mockResolvedValue([]);
    expect(await indexedTreasuryHistory(scope, 0)).toMatchObject({ calls: [], hasMore: false });
    mock.raw.mockClear();
    await expect(indexedTreasuryHistory({ ...scope, deploymentId: '' }, 0)).rejects.toThrow();
    expect(mock.raw).not.toHaveBeenCalled();
  });
});
