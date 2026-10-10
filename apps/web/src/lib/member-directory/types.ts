export type DirectoryMember = {
  address: string;
  owned_token_count: string;
  voting_power: string;
  delegated_to: string | null;
  last_activity_ledger: number | null;
};
export type DirectoryScope = { deploymentId: string; daoId: string };
export type DirectoryPage<T> = DirectoryScope & {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  generatedAt: string;
};
export type DirectoryProfile = DirectoryScope & { item: DirectoryMember | null };
export type OwnedToken = {
  tokenId: number;
  owner: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};
