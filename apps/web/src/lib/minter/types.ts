/** Claims are merkle-only (docs/STORAGE_DIET.md D8). */
export type ClaimAction = { method: 'merkle'; round: number; amount: string; proof: string[] };

/**
 * The published claim list for the current round, checked against the chain:
 * `verified` when the file at `tree_uri` rebuilds to the on-chain root (then
 * `entry` is the connected wallet's allocation, if it has one); `unavailable`
 * when it does not resolve or does not match ("claim list unavailable").
 */
export type ClaimListState =
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }
  | { status: 'verified'; recipients: number; tokenTotal: string; entry: { amount: string; proof: string[] } | null };

export type ClaimState = {
  deploymentId: string;
  daoId: string;
  tokenContractId: string;
  minterContractId: string | null;
  network: string;
  address: string | null;
  authenticated: boolean;
  live: boolean;
  mintAuthority: boolean;
  admin: string;
  ledger: number | null;
  merkle: { round: number | null; root: string | null; treeUri: string | null; claimed: boolean | null };
  claimList: ClaimListState;
};

export type PreparedClaim = {
  deploymentId: string;
  daoId: string;
  tokenContractId: string;
  minterContractId: string;
  address: string;
  networkPassphrase: string;
  rpcUrl: string;
  method: ClaimAction['method'];
  round: number;
  amount: string;
  xdr: string;
  fee: string;
};

export type ClaimHistory = {
  deploymentId: string;
  daoId: string;
  items: {
    claim_id: string;
    recipient: string | null;
    amount: string | null;
    claim_type: string;
    transaction_hash: string | null;
    ledger_sequence: number;
    timestamp: string | null;
  }[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
  generatedAt: string;
};
