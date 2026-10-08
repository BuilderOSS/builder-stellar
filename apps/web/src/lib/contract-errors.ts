/**
 * Contract error code -> user message mapping.
 *
 * Error codes are only unique PER CONTRACT (e.g. auction 1201 vs manager 1201, token 1103/1105 vs
 * manager 1103/1105, minter vs metadata 3/4/10/11/13), so lookups are keyed by (contract, code).
 * CommonError 9001-9011 is shared and raised by every module's launch/upgrade paths.
 * Source of truth: contracts/*\/src/{error,errors}.rs.
 */
export type ContractName =
  'manager' | 'token' | 'governor' | 'treasury' | 'auction' | 'marketplace' | 'metadata' | 'minter';

const COMMON_ERRORS: Record<number, string> = {
  9001: 'The DAO has not been launched yet (NotLive).',
  9002: 'This module has already been launched (AlreadyLive).',
  9003: 'Manager is not set on this contract.',
  9004: 'Current implementation hash is not set.',
  9005: 'Implementation hash mismatch.',
  9006: 'This upgrade has not been approved by the manager.',
  9007: 'Implementation not found.',
  9008: 'Owner is not set on this contract.',
  9009: 'Contract version is not set.',
  9010: 'Treasury is not set on this contract.',
  9011: 'Governor is not set on this contract.'
};

const CONTRACT_ERRORS: Record<ContractName, Record<number, string>> = {
  manager: {
    1000: 'Only the manager admin can do this.',
    1006: 'Manager admin is not set.',
    1007: 'There is no pending admin transfer.',
    1008: 'No platform minter has been registered by the manager admin, so the minter cannot be enabled at launch.',
    1101: 'DAO creation is currently paused.',
    1103: 'A DAO creation parameter is out of bounds.',
    1105: 'Quorum must be between 1 and 10,000 basis points.',
    1107: 'Invalid auction duration.',
    1108: 'Auction time buffer must be between 1 and 86,400 seconds.',
    1117: 'Voting delay, voting period and queue delay must each be between 300 and 2,592,000 seconds.',
    1120: 'Proposal threshold must be at least 1 vote and cannot exceed the initial supply.',
    1121: 'The launch supply is zero. Mint founder tokens or enable the auction or minter before launching.',
    1201: 'DAO not found or not pending launch.'
  },
  token: {
    1102: 'Token owner is not set.',
    1103: 'This address does not have mint authority.',
    1104: 'Invalid token input.',
    1105: 'Treasury mismatch.',
    1106: 'The treasury is not a minter.'
  },
  governor: {
    1500: 'Queue delay must be between 300 and 2,592,000 seconds.',
    1501: 'Proposal threshold must be at least 1 vote and cannot exceed total supply.',
    1502: 'Quorum must be between 1 and 10,000 basis points.',
    1503: 'Governor owner is not set.',
    1505: 'Voting delay must be at least 300 seconds.',
    1506: 'Voting period must be at least 300 seconds.',
    1507: 'Treasury mismatch.',
    1508: 'Proposals are executed through the Treasury, not the Governor (UseTreasuryExecute).',
    1509: 'A proposal can have at most 20 actions (TooManyActions).',
    1510: 'Voting delay cannot exceed 30 days.',
    1511: 'Voting period cannot exceed 30 days.',
    1512: 'Queue delay cannot exceed 30 days.'
  },
  treasury: {
    1401: 'Treasury mismatch.',
    1402: 'Proposals may only call upgrade or sync_version on the Treasury itself (UnknownSelfCall).',
    1403: 'Invalid arguments for a Treasury self-call.',
    1404: 'Proposal targets, functions and arguments must have the same length.'
  },
  auction: {
    1201: 'Invalid token id.',
    1202: 'The auction is over.',
    1203: 'The auction has not started.',
    1204: 'The auction is still active.',
    1205: 'The auction is already settled.',
    1206: 'The bid is below the reserve price.',
    1207: 'The bid is below the minimum next bid.',
    1208: 'Invalid auction configuration.',
    1212: 'The auction has not been launched.',
    1214: 'Not authorized.',
    1216: 'Invalid bid.',
    1222: 'Treasury mismatch.',
    1223: 'The auction payment token differs from the one set when the DAO was created.',
    1224: 'There is no pending refund for this address.',
    1225: 'Auction time buffer must be between 1 and 86,400 seconds.'
  },
  marketplace: {
    1303: 'Invalid price.',
    1304: 'Invalid expiry.',
    1305: 'A listing already exists.',
    1306: 'Listing not found.',
    1307: 'Listing has expired.',
    1308: 'Listing is still active.',
    1309: 'Only the seller can do this.',
    1310: 'Invalid fee.',
    1312: 'Treasury mismatch.',
    1313: 'The marketplace payment asset differs from the one set when the DAO was created.',
    1314: 'The marketplace is paused.'
  },
  metadata: {
    3: 'Metadata is not initialized.',
    4: 'Treasury mismatch.',
    10: 'At least one property and item is required.',
    11: 'A property has no items.',
    12: 'Too many properties.',
    13: 'Invalid property selected.',
    14: 'No properties have been added.',
    15: 'Too many items in one call: add at most 30 items per transaction (TooManyItems).',
    16: 'Page limit too high: request at most 50 items per page (LimitTooHigh).',
    20: 'Only the token contract can do this.',
    21: 'That token has not been minted.',
    22: 'Artwork for this token is already seeded (AlreadySeeded).',
    30: 'Not authorized.'
  },
  minter: {
    2: 'Invalid amount.',
    3: 'Invalid token id.',
    4: 'Batch too large.',
    5: 'Merkle root is not set.',
    6: 'Allowlist is not set.',
    7: 'Address is not in the allowlist.',
    8: 'Already claimed.',
    9: 'Invalid merkle proof.',
    10: 'Invalid input.',
    11: 'Token contract error.',
    13: 'The token has not been launched yet (TokenNotLive).'
  }
};

/** Codes whose meaning differs between contracts. Without the contract they cannot be described reliably. */
function isAmbiguous(code: number) {
  if (COMMON_ERRORS[code]) return false;
  let count = 0;
  for (const table of Object.values(CONTRACT_ERRORS)) {
    if (table[code]) count += 1;
  }
  return count > 1;
}

export function getContractErrorMessage(contract: ContractName | undefined, code: number): string | undefined {
  if (COMMON_ERRORS[code]) return COMMON_ERRORS[code];
  if (contract) return CONTRACT_ERRORS[contract][code];
  if (isAmbiguous(code)) return undefined;
  for (const table of Object.values(CONTRACT_ERRORS)) {
    if (table[code]) return table[code];
  }
  return undefined;
}

/** Extracts N from "Error(Contract, #N)" (Soroban host error text), or null. */
export function parseContractErrorCode(error: unknown): number | null {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = text.match(/Error\(Contract,\s*#(\d+)\)/);
  return match ? Number(match[1]) : null;
}

/**
 * Human-readable message for a failed contract call. Pass `contract` whenever the failing
 * contract is known; ambiguous codes are only described when the contract is given.
 * Returns undefined when the error is not a recognised contract error.
 */
export function describeContractError(error: unknown, contract?: ContractName): string | undefined {
  const code = parseContractErrorCode(error);
  if (code === null) return undefined;
  const message = getContractErrorMessage(contract, code);
  return message ? `${message} (code ${code})` : undefined;
}
