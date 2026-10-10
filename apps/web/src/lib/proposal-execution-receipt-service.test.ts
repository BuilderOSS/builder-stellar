import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: query } }));
import { type ExecutionReceiptScope, getIndexedExecutionReceipt } from './proposal-execution-receipt-service';

const scope = {
  deploymentId: 'deployment1',
  daoId: 'dao1',
  treasuryContractId: 'treasury1',
  governorContractId: 'governor1'
};
const proposal = { proposalId: 'proposal1', targets: ['target1', 'target2'], functions: ['mint', 'pause'] };
const rows = (identity: ExecutionReceiptScope = scope) =>
  proposal.targets.map((target, index) => ({
    deployment_id: identity.deploymentId,
    dao_id: identity.daoId,
    treasury_contract: identity.treasuryContractId,
    governor: identity.governorContractId,
    proposal_id: proposal.proposalId,
    target,
    function: proposal.functions[index],
    call_index: index,
    event_ledger: 100n,
    transaction_hash: 'hash'
  }));
describe('existing indexed execution view: read-only and tenant-scoped', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue(rows());
  });
  it('uses bound deployment + DAO + Treasury + Governor + proposal identities and deterministic order', async () => {
    expect(await getIndexedExecutionReceipt(scope, proposal)).toEqual({
      source: 'indexed',
      transactionHash: 'hash',
      ledger: 100,
      calls: [
        { index: 0, target: 'target1', function: 'mint' },
        { index: 1, target: 'target2', function: 'pause' }
      ]
    });
    const [sql, ...parameters] = query.mock.calls[0]!;
    expect(parameters).toEqual(['deployment1', 'dao1', 'treasury1', 'governor1', 'proposal1']);
    expect(sql.join('')).toContain('FROM governance.proposal_execution_calls');
    expect(sql.join('')).toContain('ORDER BY call_index ASC');
    expect(sql.join('')).toContain('LIMIT 21');
  });
  it('never accepts another deployment/DAO receipt and fails closed on missing identity', async () => {
    const other = { ...scope, deploymentId: 'deployment2', daoId: 'dao2' };
    query.mockResolvedValue(rows(other));
    await expect(getIndexedExecutionReceipt(scope, proposal)).rejects.toThrow(/scoped/);
    await expect(getIndexedExecutionReceipt(other, proposal)).resolves.toMatchObject({ source: 'indexed' });
    const count = query.mock.calls.length;
    await expect(getIndexedExecutionReceipt({ ...scope, deploymentId: '' }, proposal)).rejects.toThrow(/identity/);
    await expect(getIndexedExecutionReceipt({ ...scope, daoId: '' }, proposal)).rejects.toThrow(/identity/);
    expect(query).toHaveBeenCalledTimes(count);
  });
  it('returns pending for absent data but never fabricates complete receipts from partial/mixed transactions', async () => {
    query.mockResolvedValue([]);
    expect(await getIndexedExecutionReceipt(scope, proposal)).toBeNull();
    query.mockResolvedValue(rows().slice(0, 1));
    await expect(getIndexedExecutionReceipt(scope, proposal)).rejects.toThrow(/unavailable/);
    query.mockResolvedValue([rows()[0], { ...rows()[1], transaction_hash: 'different-tx' }]);
    await expect(getIndexedExecutionReceipt(scope, proposal)).rejects.toThrow(/unavailable/);
  });
});
