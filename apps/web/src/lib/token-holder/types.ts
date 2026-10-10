import type { OnchainTokenMetadata } from '@/lib/onchain-token-metadata';

export type HolderAction =
  | { action: 'transfer'; tokenId: string; destination: string }
  | { action: 'approve'; tokenId: string; destination: string; expirationLedger: string }
  | { action: 'revoke'; tokenId: string }
  | { action: 'delegate'; tokenId: string; destination: string };
export type HolderPrepared = {
  deploymentId: string;
  daoId: string;
  address: string;
  tokenContractId: string;
  tokenId: number;
  networkPassphrase: string;
  rpcUrl: string;
  xdr: string;
  fee: string;
  summary: string;
};
export type HolderDetail = {
  deploymentId: string;
  daoId: string;
  tokenId: number;
  owner: string | null;
  ownerSource: 'onchain' | 'indexed' | 'unavailable';
  indexedOwner: string | null;
  metadata: OnchainTokenMetadata | null;
  metadataIssue: string | null;
};
