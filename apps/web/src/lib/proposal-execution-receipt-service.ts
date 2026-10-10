import { prisma } from '@/lib/prisma';
import type { ProposalExecutionReceipt } from '@/lib/proposal-execution-receipt';

export type ExecutionReceiptScope = {
  deploymentId: string;
  daoId: string;
  treasuryContractId: string;
  governorContractId: string;
};
type ExecutionCallRow = {
  deployment_id: string;
  dao_id: string;
  treasury_contract: string;
  governor: string;
  proposal_id: string;
  call_index: number;
  target: string;
  function: string;
  event_ledger: bigint | number;
  transaction_hash: string;
};

/** Existing read-only view, parameterized tenant filters; no Prisma/schema changes. */
export async function getIndexedExecutionReceipt(
  scope: ExecutionReceiptScope,
  proposal: { proposalId: string; targets: string[]; functions: string[] }
): Promise<ProposalExecutionReceipt | null> {
  if (
    [scope.deploymentId, scope.daoId, scope.treasuryContractId, scope.governorContractId].some(
      (identity) => !identity?.trim()
    ) ||
    !proposal.proposalId.trim()
  )
    throw new Error('Missing execution receipt identity.');
  if (!proposal.targets.length || proposal.targets.length > 20 || proposal.targets.length !== proposal.functions.length)
    throw new Error('Invalid proposal action count.');
  const rows = await prisma.$queryRaw<ExecutionCallRow[]>`
    SELECT deployment_id, dao_id, treasury_contract, governor, proposal_id,
           call_index, target, "function", event_ledger, transaction_hash
    FROM governance.proposal_execution_calls
    WHERE deployment_id = ${scope.deploymentId}
      AND dao_id = ${scope.daoId}
      AND treasury_contract = ${scope.treasuryContractId}
      AND governor = ${scope.governorContractId}
      AND proposal_id = ${proposal.proposalId}
    ORDER BY call_index ASC, event_ledger ASC, transaction_index ASC,
             operation_index ASC, event_index ASC, event_id ASC
    LIMIT 21
  `;
  if (!rows.length) return null;
  const first = rows[0]!;
  const ledger = Number(first.event_ledger);
  if (
    !Number.isSafeInteger(ledger) ||
    ledger <= 0 ||
    !first.transaction_hash ||
    rows.length !== proposal.targets.length ||
    rows.some(
      (row, index) =>
        row.deployment_id !== scope.deploymentId ||
        row.dao_id !== scope.daoId ||
        row.treasury_contract !== scope.treasuryContractId ||
        row.governor !== scope.governorContractId ||
        row.proposal_id !== proposal.proposalId ||
        row.call_index !== index ||
        row.target !== proposal.targets[index] ||
        row.function !== proposal.functions[index] ||
        row.transaction_hash !== first.transaction_hash ||
        Number(row.event_ledger) !== ledger
    )
  ) {
    throw new Error('Complete scoped execution receipt is unavailable.');
  }
  return {
    source: 'indexed',
    transactionHash: first.transaction_hash,
    ledger,
    calls: rows.map((row) => ({ index: row.call_index, target: row.target, function: row.function }))
  };
}
