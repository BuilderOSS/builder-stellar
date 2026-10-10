/**
 * Contract error code -> user message mapping.
 *
 * Every project contract error code is unique: each crate owns a block of 100 codes in
 * 7000-7899 (common 7000, manager 7100, token 7200, metadata 7300, auction 7400, governor 7500,
 * treasury 7600, marketplace 7700, minter 7800), outside every OpenZeppelin range. A code
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
  7009: 'Contract version is not set.',
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
  7108: 'No platform minter has been registered by the manager admin, so the minter cannot be enabled at launch.',
  7109: 'An implementation is already registered for this WASM hash.',
  7110: 'The platform minter changed; review it and launch again.',
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
  7122: 'Slugs are 4-63 characters of a-z, 0-9 and single hyphens, not at the start or end.',
  7123: 'That slug is already taken by a launched DAO. Choose another slug.',
  7124: 'The factory has no current implementations configured.',
  7125: 'The marketplace fee can be at most 25% (2,500 basis points).',
  7126: 'The launch admin no longer administers the token.',
  7127: 'DAO not found or not pending launch.',
  7128: 'No launched DAO uses this slug.',
  // token
  7201: 'This address does not have mint authority.',
  7202: 'Invalid token input.',
  7203: 'Treasury mismatch.',
  7204: 'The treasury is not a minter.',
  7205: 'Batch too large for one transaction: mint at most 43 tokens to one recipient, fewer when spread over several (18 recipients with one token each).',
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
  // treasury
  7601: 'Treasury mismatch.',
  7602: 'Proposals may only call upgrade, migrate or sync_version on the Treasury itself (UnknownSelfCall).',
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
  // minter
  7801: 'Invalid amount.',
  7802: 'Invalid token contract.',
  7803: 'Batch too large: at most 18 recipients per transaction.',
  7804: 'Merkle root is not set.',
  7805: 'Allowlist is not set.',
  7806: 'Address is not in the allowlist.',
  7807: 'Already claimed.',
  7808: 'Invalid merkle proof.',
  7809: 'Invalid input.',
  7810: 'The token has not been launched yet (TokenNotLive).',
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
