import { StrKey } from '@stellar/stellar-sdk';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { prisma } from '@/lib/prisma';
import { proposalIdToBuffer } from '@/lib/proposal-id';

import type { TreasuryHistory, TreasuryScope } from './types';
import { assertTreasuryIdentity, assertTreasuryScope } from './values';

export class TreasuryError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function treasuryScope(daoId: string): Promise<TreasuryScope> {
  if (!StrKey.isValidContract(daoId)) throw new TreasuryError('Invalid community identifier.');
  const row = await prisma.managerDao.findFirst({ where: { deploymentId: DEPLOYMENT_ID, daoId } });
  if (!row) throw new TreasuryError('Community not found in this deployment.', 404);
  if (
    row.deploymentId !== DEPLOYMENT_ID ||
    row.daoId !== daoId ||
    row.tokenContract !== daoId ||
    row.tokenAddress !== daoId ||
    !row.treasuryContract ||
    !StrKey.isValidContract(row.treasuryContract) ||
    !StrKey.isValidContract(row.governorContract)
  )
    throw new TreasuryError('Treasury registry identity is unavailable.', 503);
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId,
    treasuryContractId: row.treasuryContract,
    governorContractId: row.governorContract
  };
}

export type TreasuryCallRow = {
  deployment_id: string;
  dao_id: string;
  contract_id: string;
  governor: string;
  event_id: string;
  proposal_id: string;
  call_index: number;
  target: string;
  function: string;
  event_ledger: bigint;
  event_at: Date | null;
  transaction_hash: string;
};

export async function indexedTreasuryHistory(scope: TreasuryScope, page: number): Promise<TreasuryHistory> {
  assertTreasuryScope(scope);
  if (!Number.isInteger(page) || page < 0 || page > 1000) throw new TreasuryError('Invalid history page.');
  // Query the existing read-only view. All pagination happens AFTER all four identity filters.
  const rows = await prisma.$queryRaw<TreasuryCallRow[]>`
    SELECT deployment_id, dao_id, contract_id, governor, event_id, proposal_id,
           call_index, target, "function", event_ledger, event_at, transaction_hash
    FROM treasury.calls
    WHERE deployment_id = ${scope.deploymentId} AND dao_id = ${scope.daoId}
      AND contract_id = ${scope.treasuryContractId} AND governor = ${scope.governorContractId}
    ORDER BY event_ledger DESC, transaction_index DESC, operation_index DESC,
             event_index DESC, event_id DESC
    LIMIT 13 OFFSET ${page * 12}
  `;
  const calls = rows.map((row) => {
    assertTreasuryIdentity(
      {
        deploymentId: row.deployment_id,
        daoId: row.dao_id,
        treasuryContractId: row.contract_id,
        governorContractId: row.governor
      },
      scope
    );
    const proposal = proposalIdToBuffer(row.proposal_id);
    if (
      proposal.length !== 32 ||
      !row.event_id ||
      !/^[a-fA-F0-9]{64}$/.test(row.transaction_hash) ||
      !Number.isInteger(row.call_index) ||
      row.call_index < 0 ||
      row.call_index >= 20 ||
      !StrKey.isValidContract(row.target) ||
      !row.function ||
      BigInt(row.event_ledger) <= 0n
    )
      throw new TreasuryError('Indexed execution receipt is invalid.', 503);
    return {
      eventId: row.event_id,
      proposalId: proposal.toString('hex'),
      index: row.call_index,
      target: row.target,
      function: row.function,
      ledger: row.event_ledger.toString(),
      at: row.event_at?.toISOString() ?? null,
      transactionHash: row.transaction_hash
    };
  });
  return { ...scope, page, calls: calls.slice(0, 12), hasMore: page < 1000 && rows.length > 12 };
}
