import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { StrKey } from '@stellar/stellar-sdk';
import type { Api } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

import { proposalIdToBuffer } from '@/lib/proposal-id';
import type { ProposalEncodingContext } from '@/lib/proposal-supported-calls';

export type ProposalExecutionReceipt = {
  source: 'chain' | 'indexed';
  transactionHash: string;
  ledger: number;
  calls: { index: number; target: string; function: string }[];
};

/** Only successful, scoped Treasury Execute events constitute a receipt. */
export function decodeExecutionReceipt(
  response: Api.GetSuccessfulTransactionResponse,
  config: ProposalEncodingContext,
  proposal: { proposalId: string; targets: string[]; functions: string[] }
): ProposalExecutionReceipt {
  if (response.status !== 'SUCCESS') throw new Error('Only successful transactions have execution receipts.');
  const spec = new TreasuryClient({
    contractId: config.treasuryContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase
  }).spec;
  const calls: ProposalExecutionReceipt['calls'] = [];
  for (const events of response.events.contractEventsXdr) {
    for (const event of events) {
      const contractId = event.contractId;
      if (!contractId || StrKey.encodeContract(contractId.value) !== config.treasuryContractId) continue;
      const parsed = spec.parseEvent(event.body.v0.topics, event.body.v0.data);
      if (parsed?.name !== 'Execute') continue;
      const data = parsed.data as Record<string, unknown>;
      if (
        data.governor !== config.governorContractId ||
        !Buffer.from(data.proposal_id as Uint8Array).equals(proposalIdToBuffer(proposal.proposalId))
      )
        continue;
      const index = Number(data.index);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        data.target !== proposal.targets[index] ||
        data.function !== proposal.functions[index]
      )
        throw new Error('Execution receipt does not match proposal actions.');
      calls.push({ index, target: String(data.target), function: String(data.function) });
    }
  }
  calls.sort((a, b) => a.index - b.index);
  if (calls.length !== proposal.targets.length || calls.some((call, i) => call.index !== i))
    throw new Error('Complete ordered execution receipt is unavailable.');
  return { source: 'chain', transactionHash: response.txHash, ledger: response.ledger, calls };
}
