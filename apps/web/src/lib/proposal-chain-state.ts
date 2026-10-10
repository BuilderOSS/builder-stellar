import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';
import { proposalIdToBuffer } from '@/lib/proposal-id';

export const PROPOSAL_EXPIRATION_SECONDS = 1_209_600;

export function proposalCoreKey(governor: string, proposalId: string) {
  // contracts/governor/src/storage.rs: GovernorKey::Proposal(BytesN<32>).
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(governor).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Proposal'), xdr.ScVal.scvBytes(proposalIdToBuffer(proposalId))]),
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

export function decodeProposalCore(value: xdr.ScVal) {
  const core = scValToNative(value);
  const seconds = (key: string) => {
    const number = Number(core?.[key]);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid proposal ${key}.`);
    return number;
  };
  return {
    voteStart: seconds('vote_start'),
    voteEnd: seconds('vote_end'),
    snapshot: seconds('vote_snapshot'),
    eta: seconds('eta')
  };
}

/** Optional storage/timing reads must never invalidate the authoritative state. */
export async function readProposalChainState(config: DaoNetworkConfig, proposalId: string) {
  const client = new GovernorClient({
    contractId: config.governorContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(config.launchAdmin)
  });
  const id = proposalIdToBuffer(proposalId);
  const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const [state, deadline, snapshot, core] = await Promise.allSettled([
    client.proposal_state({ proposal_id: id }),
    client.proposal_deadline({ proposal_id: id }),
    client.proposal_snapshot({ proposal_id: id }),
    server.getLedgerEntries(proposalCoreKey(config.governorContractId, proposalId)).then((response) => {
      const entry = response.entries[0];
      return entry?.val.type === 'contractData' ? decodeProposalCore(entry.val.contractData.val) : null;
    })
  ]);
  const snapshotValue = snapshot.status === 'fulfilled' ? snapshot.value.result : null;
  let quorumVotes: string | null = null;
  if (snapshotValue !== null) {
    try {
      quorumVotes = (await client.quorum({ ledger: snapshotValue })).result.toString();
    } catch {
      /* optional */
    }
  }
  return {
    state: state.status === 'fulfilled' ? state.value.result : null,
    stateSource: state.status === 'fulfilled' ? ('chain' as const) : ('indexed' as const),
    deadline: deadline.status === 'fulfilled' ? deadline.value.result : null,
    snapshot: snapshotValue,
    core: core.status === 'fulfilled' ? core.value : null,
    quorumVotes
  };
}
