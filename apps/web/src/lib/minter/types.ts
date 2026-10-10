export type ClaimAction =
  { method: 'allowlist'; round: number } | { method: 'merkle'; round: number; amount: string; proof: string[] };

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
  owner: string;
  ledger: number | null;
  merkle: { round: number | null; root: string | null; claimed: boolean | null };
  allowlist: { round: number | null; amount: string | null; member: boolean | null; claimed: boolean | null };
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
