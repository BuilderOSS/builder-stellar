/**
 * Contract error code -> user message mapping.
 *
 * Every project contract error code is unique: each crate owns a block of 100 codes in
 * 7000-7899 (common 7000, manager 7100, token 7200, metadata 7300, auction 7400, governor 7500,
 * treasury 7600, marketplace 7700, minter 7800: the ClaimMinter), outside every OpenZeppelin range. A code
 * therefore identifies its contract on its own, even when it surfaces through a cross-contract
 * call. The OpenZeppelin codes users commonly hit (governor lifecycle, pausable) are included.
 * Source of truth: contracts/*\/src/{error,errors}.rs and contracts/common/src/error.rs.
 */
export type ContractName =
  'manager' | 'token' | 'governor' | 'treasury' | 'auction' | 'marketplace' | 'metadata' | 'minter';

/** Error-code block owned by each contract (common errors live in 7000-7099). */
export const ERROR_CODE_BLOCKS: Record<ContractName | 'common', number> = {
  common: 7000,
  manager: 7100,
  token: 7200,
  metadata: 7300,
  auction: 7400,
  governor: 7500,
  treasury: 7600,
  marketplace: 7700,
  minter: 7800
};

const ERRORS: Record<number, string> = {
  // common
  7001: 'The DAO has not been launched yet (NotLive).',
  7002: 'This module has already been launched (AlreadyLive).',
  7003: 'Manager is not set on this contract.',
  7004: 'Current implementation hash is not set.',
  7005: 'Implementation hash mismatch.',
  7006: 'This upgrade has not been approved by the manager.',
  7007: 'Implementation not found.',
  7008: 'The module admin is not set.',
  7009: 'The Manager version is not set.',
  7010: 'Treasury is not set on this contract.',
  7011: 'Governor is not set on this contract.',
  7012: 'The contract storage is already up to date (NothingToMigrate).',
  7013: 'Storage version is not set.',
  // manager
  7101: 'The implementation is registered under a different module name.',
  7102: 'Invalid manager version or hash.',
  7103: 'Implementation not found or revoked.',
  7104: 'Implementation already revoked.',
  7105: 'This upgrade path is not allowed.',
  7106: 'Manager admin is not set.',
  7107: 'There is no pending admin transfer.',
  7109: 'An implementation is already registered for this WASM hash.',
  7111: 'DAO creation and launch are currently paused.',
  7112: 'The auction reserve price is too low.',
  7113: 'Quorum must be between 1 and 10,000 basis points.',
  7114: 'Auction duration must be between 5 minutes and 30 days.',
  7115: 'Auction time buffer must be between 1 and 86,400 seconds.',
  7116: 'A text field is too long (at most 256 characters).',
  7117: 'A required text field is empty.',
  7118: 'Voting delay, voting period and queue delay must each be between 300 and 2,592,000 seconds.',
  7119: 'Proposal threshold must be at least 1 vote.',
  7120: 'There are no voting tokens yet. Mint founder tokens to holders (not the Treasury) before launching.',
  7121: 'A module runs a revoked or unregistered implementation; upgrade it before launching.',
  7122: 'Links use 4-63 lowercase letters, numbers or single hyphens, not at the start or end.',
  7123: 'Another tribe has this link. Pick another.',
  7124: 'The factory has no current implementations configured.',
  7125: 'The marketplace fee can be at most 25% (2,500 basis points).',
  7126: 'The launch admin no longer administers the token.',
  7127: 'DAO not found or not pending launch.',
  7128: 'No launched tribe uses this link.',
  7129: 'This is already your link.',
  7131: 'The Manager can only upgrade to its announced latest implementation (UpgradeNotLatest).',
  7132: "A module's payment asset changed since the DAO was created; change it back before launching (PaymentAssetMismatch).",
  7133: 'Each module kind can be created at most once (InvalidModules).',
  7134: 'A module of this kind was created since this was prepared; review and try again (StaleModuleIndex).',
  7135: 'This tribe has no claims module (NoClaimMinter).',
  7136: 'This tribe already ran an assurance drive (AssuranceExists).',
  7137: 'An assurance deadline can be at most 90 days away (DeadlineTooFar).',
  7138: 'This tribe is in an assurance drive: its link is reserved and fixed (AssuranceOpen).',
  7139: 'This tribe has no assurance drive (NoAssurance).',
  7140: 'The assurance drive has not reached its number of members yet (AssuranceNotMet).',
  7141: 'The assurance drive passed its deadline without launching: it ends in refunds (AssuranceFailed).',
  7142: 'The assurance drive has not failed (AssuranceNotFailed).',
  7143: 'A transfer agent must be a module this tribe is created with (UnknownAgentKind).', // token
  7201: 'This module may not mint (MintAuthorityNotAllowed).',
  7202: 'Invalid token input.',
  7203: 'Treasury mismatch.',
  7204: 'The treasury is not a minter.',
  7205: 'Batch too large for one transaction: mint at most 43 tokens to one recipient, fewer when spread over several (18 recipients with one token each).',
  7207: 'Names may not contain quotes, backslashes or control characters (InvalidName).',
  7208: 'The token has no metadata contract address (MetadataNotSet).',
  7209: 'That address is not one of this tribe’s modules (NotAModule).',
  7210: 'Only deployed contracts can be modules (NotAContract).',
  7211: 'A module kind is auction, marketplace, claims, circle or custom_<name> (InvalidKind).',
  7212: 'Another module already has this kind (KindTaken).',
  7213: 'This module is already registered (ModuleAlreadyRegistered).',
  7214: 'This tribe already has the most modules allowed (TooManyModules).',
  7215: 'This module has used its whole mint allowance (AllowanceExceeded).',
  7216: 'Memberships are locked: tokens move only by sale, by giving them to the DAO or by a DAO vote (TransfersLocked).',
  7217: 'That setting already has this value (SettingUnchanged).',
  7218: 'DAO recovery is off: turn it on in the same proposal first (RecoveryOff).',
  7219: 'This module is not a transfer agent (NotTransferAgent).',
  7220: 'A DAO transfer cannot move tokens held by a module (ModuleCustody).',
  7221: 'Votes can only be delegated to members of this tribe (DelegateNotMember).',
  // metadata
  7301: 'Metadata is not initialized.',
  7302: 'Treasury mismatch.',
  7303: 'At least one property and item is required.',
  7304: 'A property has no items.',
  7305: 'Too many properties (at most 16).',
  7306: 'Invalid property selected.',
  7307: 'No properties have been added.',
  7308: 'Too many items in one call: add at most 30 items per transaction (TooManyItems).',
  7309: 'Page limit too high: request at most 50 items per page (LimitTooHigh).',
  7310: 'That token has not been minted.',
  7311: 'Artwork for this token is already seeded (AlreadySeeded).',
  7312: 'Text is too long (at most 256 characters).',
  7313: 'Artwork and property names may not contain quotes, backslashes or control characters, and are at most 64 characters (InvalidName).',
  7314: 'Too many image folders: at most 64 per collection (TooManyIpfsGroups).',
  7315: 'This property has reached its item limit (PropertyFull).',
  7316: 'The profile must be 1 to 4,096 bytes (InvalidProfile).',
  7317: 'The profile changed since this was prepared: another update landed first. Review the current profile and propose again (ProfileSeqMismatch).',
  7318: "This token's description is too long to build on chain (TokenUriTooLong).",
  7319: 'This token has no artwork yet; the tribe can seed it with regenerate (NotSeeded).',
  // auction
  7401: 'Invalid token id.',
  7402: 'The auction is over.',
  7403: 'The auction has not started.',
  7404: 'The auction is still active.',
  7405: 'The auction is already settled.',
  7406: 'The bid is below the reserve price.',
  7407: 'The bid is below the minimum next bid.',
  7408: 'Invalid auction configuration.',
  7409: 'The auction has not been launched.',
  7410: 'Not authorized.',
  7411: 'Arithmetic overflow.',
  7412: 'Invalid bid.',
  7413: 'The auction is not initialized.',
  7414: 'Treasury mismatch.',
  7415: 'The auction payment token differs from the one set when the DAO was created.',
  7416: 'There is no pending refund for this address.',
  7417: 'Auction time buffer must be between 1 and 86,400 seconds.',
  7418: 'A bid comment can be at most 1,024 bytes (CommentTooLong).',
  // governor
  7501: 'Queue delay must be at least 300 seconds.',
  7502: 'Proposal threshold must be at least 1 vote and cannot exceed the voting supply.',
  7503: 'Quorum must be between 1 and 10,000 basis points.',
  7504: 'Voting delay must be at least 300 seconds.',
  7505: 'Voting period must be at least 300 seconds.',
  7506: 'Treasury mismatch.',
  7507: 'Proposals are executed through the Treasury, not the Governor (UseTreasuryExecute).',
  7508: 'A proposal can have at most 20 actions (TooManyActions).',
  7509: 'Voting delay cannot exceed 30 days.',
  7510: 'Voting period cannot exceed 30 days.',
  7511: 'Queue delay cannot exceed 30 days.',
  7512: 'You had no voting power when this proposal was created.',
  7513: 'This proposal is queued but its execution time has not arrived yet.',
  7514: 'A comment cannot be empty (CommentEmpty).',
  7515: 'A comment can be at most 8,192 bytes (CommentTooLong).',
  // treasury
  7601: 'Treasury mismatch.',
  7602: 'Proposals may only call upgrade or migrate on the Treasury itself (UnknownSelfCall).',
  7603: 'Invalid arguments for a Treasury self-call.',
  7604: 'Proposal targets, functions and arguments must have the same length.',
  7605: 'An authorize action is malformed, too large, or not followed by the call it applies to.',
  // marketplace
  7701: 'The marketplace is not initialized.',
  7702: 'Invalid price.',
  7703: 'Invalid expiry.',
  7704: 'A listing already exists.',
  7705: 'Listing not found.',
  7706: 'Listing has expired.',
  7707: 'Listing is still active.',
  7708: 'Only the seller can do this.',
  7709: 'The fee can be at most 25% (2,500 basis points).',
  7710: 'Arithmetic overflow.',
  7711: 'Treasury mismatch.',
  7712: 'The payment asset changed; review the listing terms and try again.',
  7713: 'The marketplace is paused.',
  7714: 'The marketplace fee increased above what you approved; review and try again.',
  7715: 'The price is higher than the maximum you approved.',
  7716: 'A comment cannot be empty (CommentEmpty).',
  7717: 'A listing comment can be at most 1,024 bytes (CommentTooLong).',
  7718: 'Grant the Marketplace a mint allowance for the pool size first (AllowanceNotReserved).',
  7719: 'Pool not found (PoolNotFound).',
  7720: 'This pool is closed or expired (PoolClosed).',
  7721: 'You bought the most this pool allows per buyer (BuyerLimitReached).',
  7722: 'This pool sold its limit for now; try again later (PoolRateLimited).',
  7723: 'That token is no longer in this pool; pick another (NotInPool).',
  7724: 'Too many pools are open: close and sweep one first (TooManyPools).',
  7725: 'Close the pool before sweeping it (PoolOpen).',
  7726: 'Pool size, buyer cap, sales rate and period must all be above zero (InvalidPool).',
  7727: 'This pool is fully stocked (PoolFullyStocked).',
  // minter
  7801: 'Claim at least one token, and lists hold at least one (InvalidAmount).',
  7803: 'One claim mints at most 43 tokens; claim the rest in another transaction (BatchTooLarge).',
  7807: 'You already claimed your whole allocation on this list (AlreadyClaimed).',
  7808: 'This proof does not match your address, amount and the list (MerkleProofInvalid).',
  7809: 'The price overflows (InvalidInput).',
  7810: 'The token has not been launched yet (TokenNotLive).',
  7812: 'The claim list address must be an ipfs:// link of at most 256 characters (InvalidTreeUri).',
  7815: 'This claim list does not exist (ListNotFound).',
  7816: 'This claim list has expired (ListExpired).',
  7817: 'This claim list is sold out (ListSoldOut).',
  7818: 'The list price is above the price you agreed to (PriceAboveMax).',
  7819: 'This assurance drive failed: it only refunds now (AssuranceFailed).',
  7820: 'This list is not an assurance drive (NotAssurance).',
  7821: 'Assurance drives open before launch only (AssuranceNotAllowed).',
  7822: 'This tribe already has its assurance drive (AssuranceExists).',
  7823: 'Refunds open only once the assurance drive has failed (NotFailed).',
  7824: 'Nothing of yours is in escrow on this list (NothingToRefund).',
  7825: 'The assurance threshold must be at least 1 and its deadline after now and before the list expires (InvalidAssurance).',
  7826: 'Add the artwork before opening a claim list before launch (ArtworkMissing).',
  7827: 'A list opened before launch must use the claims payment asset (PaymentAssetMismatch).',
  7828: 'A price cannot be negative (InvalidPrice).',
  7829: 'A list must expire in the future (InvalidExpiry).',
  7830: 'Treasury mismatch (TreasuryMismatch).',
  // manager
  7130: 'The Manager upgrade was approved too recently; its upgrade notice has not passed (UpgradeDelayNotElapsed).',
  // OpenZeppelin (shared library codes)
  1000: 'This contract is paused.',
  1001: 'This contract is not paused.',
  5000: 'Proposal not found.',
  5001: 'This proposal already exists.',
  5002: 'You do not have enough votes to create a proposal.',
  5005: 'Voting is not open for this proposal.',
  5006: 'This proposal has not succeeded.',
  5007: 'This proposal is not queued (or it expired).',
  5008: 'This proposal has already been executed.',
  5009: 'This proposal can no longer be cancelled.',
  5016: 'You have already voted on this proposal.',
  5021: 'The proposal description is too long.'
};

/** Contract that owns `code`, or undefined for OpenZeppelin and unknown codes. */
export function contractForErrorCode(code: number): ContractName | 'common' | undefined {
  for (const [name, block] of Object.entries(ERROR_CODE_BLOCKS)) {
    if (code > block && code < block + 100) return name as ContractName | 'common';
  }
  return undefined;
}

/**
 * Message for `code`. Codes are unique across contracts, so `contract` is optional; when given,
 * a project code owned by a different contract is not described.
 */
export function getContractErrorMessage(contract: ContractName | undefined, code: number): string | undefined {
  const owner = contractForErrorCode(code);
  if (contract && owner && owner !== 'common' && owner !== contract) return undefined;
  return ERRORS[code];
}

/** Extracts N from "Error(Contract, #N)" (Soroban host error text), or null. */
export function parseContractErrorCode(error: unknown): number | null {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = text.match(/Error\(Contract,\s*#(\d+)\)/);
  return match ? Number(match[1]) : null;
}

/**
 * Human-readable message for a failed contract call. Returns undefined when the error is not a
 * recognised contract error.
 */
export function describeContractError(error: unknown, contract?: ContractName): string | undefined {
  const code = parseContractErrorCode(error);
  if (code === null) return undefined;
  const message = getContractErrorMessage(contract, code);
  return message ? `${message} (code ${code})` : undefined;
}
