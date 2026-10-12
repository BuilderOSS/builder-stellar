import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Address, xdr } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

import { decodeStoredProposal } from '@/lib/chain-reads/proposal-core';
import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { namespacedKey } from '@/lib/storage-key';

export const PROPOSAL_EXPIRATION_SECONDS = 1_209_600;

export function proposalCoreKey(governor: string, proposalId: string) {
  // contracts/governor/src/storage.rs: common::ns(GovernorKey::ProposalTime(BytesN<32>)).
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(governor).toScAddress(),
      key: namespacedKey('ProposalTime', xdr.ScVal.scvBytes(proposalIdToBuffer(proposalId))),
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

/**
 * The stored proposal core. `quorum` is the value the contract judges the
 * proposal against (fixed at creation, D33); never recompute it from
 * `governor.quorum(snapshot)`, which reads history the sweep no longer keeps
 * and can differ from the stored value (tokens minted in the creation ledger).
 */
export function decodeProposalCore(value: xdr.ScVal) {
  const stored = decodeStoredProposal(value);
  return {
    voteStart: stored.voteStart,
    voteEnd: stored.voteEnd,
    snapshot: stored.voteSnapshot,
    eta: stored.eta,
    quorum: stored.quorum.toString()
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
  const coreValue = core.status === 'fulfilled' ? core.value : null;
  return {
    state: state.status === 'fulfilled' ? state.value.result : null,
    stateSource: state.status === 'fulfilled' ? ('chain' as const) : ('indexed' as const),
    deadline: deadline.status === 'fulfilled' ? deadline.value.result : null,
    snapshot: snapshotValue,
    core: coreValue,
    /** The quorum the contract enforces, from the stored core; null when the core could not be read. */
    quorumVotes: coreValue?.quorum ?? null
  };
}
