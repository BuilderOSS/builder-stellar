import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

import type { ChainProposalReader } from '@/lib/chain-reads/proposals';
import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';

/** RPC-backed reader for chainProposalPage. */
export function rpcProposalReader(config: DaoNetworkConfig): ChainProposalReader {
  const client = new GovernorClient({
    contractId: config.governorContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(config.launchAdmin),
    allowHttp: config.rpcUrl.startsWith('http://')
  });
  const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  return {
    count: async () => Number((await client.proposal_count()).result),
    entries: async (keys) => {
      const values = new Map();
      // getLedgerEntries takes at most 200 keys per call.
      for (let i = 0; i < keys.length; i += 200) {
        const response = await server.getLedgerEntries(...keys.slice(i, i + 200));
        for (const entry of response.entries)
          if (entry.val.type === 'contractData') values.set(entry.key.toXDR('base64'), entry.val.contractData.val);
      }
      return values;
    },
    proposal: async (id) => {
      const info = (await client.proposal({ proposal_id: Buffer.from(id) })).result;
      return { state: Number(info.state), vote_start: info.vote_start, vote_end: info.vote_end };
    }
  };
}
