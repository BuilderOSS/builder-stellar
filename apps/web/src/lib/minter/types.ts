/**
 * A claim against one of the DAO's ClaimMinter lists (docs/designs/membership-models.md § 3):
 * `leafAmount` is the wallet's whole allocation (what the leaf commits to), `mintNow` how many
 * of it to mint in this transaction, `maxPrice` the per-token price the claimer agreed to.
 */
export type ClaimAction = { listId: number; leafAmount: string; mintNow: number; proof: string[]; maxPrice: string };

/**
 * A list's published tree, checked against the chain: `verified` when the file at `tree_uri`
 * rebuilds to the on-chain root (then `entry` is the connected wallet's allocation, if it has
 * one); `unavailable` when it does not resolve or does not match ("claim list unavailable").
 */
export type ClaimListState =
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }
  | { status: 'verified'; recipients: number; tokenTotal: string; entry: { amount: string; proof: string[] } | null };

/** An assurance list's state on chain: `failed` lists only refund. */
export type AssuranceView = { thresholdClaimers: number; deadline: number; state: 'open' | 'met' | 'failed' };

export type ClaimListView = {
  listId: number;
  root: string;
  treeUri: string;
  /** The payment asset (a Stellar Asset Contract); `price` is per token in its smallest unit. */
  asset: string;
  price: string;
  expiresAt: number;
  total: number;
  minted: number;
  claimers: number;
  assurance: AssuranceView | null;
  /** The connected wallet's record on this list; null without a wallet. */
  claimed: number | null;
  escrowed: string | null;
  claimList: ClaimListState;
};

export type ClaimState = {
  deploymentId: string;
  daoId: string;
  tokenContractId: string;
  /** The DAO's ClaimMinter from its module registry; null when the DAO has none. */
  claimsContractId: string | null;
  network: string;
  address: string | null;
  authenticated: boolean;
  live: boolean;
  /** The ClaimMinter's remaining mint allowance (4294967295 is unlimited). */
  allowance: number | null;
  /** The asset Setup lists are priced in (the ClaimMinter's `payment_asset`). */
  paymentAsset: string | null;
  /** The id the next list opened receives. */
  nextListId: number;
  admin: string;
  ledger: number | null;
  /** The newest lists first, at most CLAIM_LISTS_SHOWN of them. */
  lists: ClaimListView[];
};

export type PreparedClaim = {
  deploymentId: string;
  daoId: string;
  tokenContractId: string;
  claimsContractId: string;
  address: string;
  networkPassphrase: string;
  rpcUrl: string;
  listId: number;
  leafAmount: string;
  mintNow: number;
  maxPrice: string;
  /** What this claim costs in the list's asset (price × mintNow). */
  cost: string;
  asset: string;
  xdr: string;
  fee: string;
};

export type ClaimHistory = {
  deploymentId: string;
  daoId: string;
  items: {
    claim_id: string;
    list_id: number;
    recipient: string | null;
    amount: string | null;
    paid: string | null;
    escrowed: boolean;
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
