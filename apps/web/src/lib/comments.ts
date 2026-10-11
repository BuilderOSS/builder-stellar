import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';

/**
 * On-chain comments are event-only: the contracts emit them and never store them, so the indexer
 * is the only place they live. Caps are in UTF-8 bytes and match `contracts/common/src/lib.rs`.
 */
export const MAX_PROPOSAL_COMMENT_BYTES = 8192;
export const MAX_COMMENT_BYTES = 1024;

export type CommentItem = {
  id: string;
  author: string;
  body: string;
  timestamp: number | null;
  txHash: string;
};

const encoder = new TextEncoder();

export function commentBytes(text: string) {
  return encoder.encode(text).length;
}

/** Comments (and bid comments) exist from governor, auction and marketplace 0.2.0 on. */
export function supportsComments(version: string | undefined) {
  if (!version) return false;
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10));
  return major > 0 || (major === 0 && minor >= 2);
}

const CLIENTS = { governor: GovernorClient, auction: AuctionClient, marketplace: MarketplaceClient };
const ADDRESS_KEYS = {
  governor: 'governorContractId',
  auction: 'auctionContractId',
  marketplace: 'marketplaceContractId'
} as const;
export type CommentModule = keyof typeof CLIENTS;

/**
 * Whether this community's module runs code with comments. Each community upgrades by its own
 * proposal, so until every one reports 0.2.0 the app hides comments where they would fail.
 * `undefined` while loading.
 */
export function useCommentsSupported(config: DaoNetworkConfig, module: CommentModule) {
  const contractId = config[ADDRESS_KEYS[module]];
  const { data } = useSWR(
    contractId ? ['module-version', module, contractId, config.rpcUrl, config.passphrase] : null,
    async () => {
      const client = new CLIENTS[module](adminReadOptions(config, contractId));
      return (await client.version()).result;
    },
    { revalidateOnFocus: false }
  );
  return data === undefined ? undefined : supportsComments(data);
}
