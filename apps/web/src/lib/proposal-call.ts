import { nativeToScVal } from '@stellar/stellar-sdk';

export type ProposalCallArg = string | number | boolean | null | ProposalCallArg[] | { [key: string]: ProposalCallArg };

export type ProposalCallArgs = ProposalCallArg[][];
export type EncodedProposalCallArgs = unknown[][];

export type ProposalActionType = 'mint-governance-token' | 'batch-mint-governance-token' | 'transfer-sac-token';

export type ProposalQueuedAction = {
  id: string;
  type: ProposalActionType;
  recipient: string;
  amount: string;
  assetCode?: string;
  assetContractId?: string;
};

export type ProposalCallVectors = {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
};

function unwrapScValLike(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => unwrapScValLike(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== 1) {
    return Object.fromEntries(entries.map(([key, inner]) => [key, unwrapScValLike(inner)]));
  }

  const [key, inner] = entries[0];
  if (key === 'string' || key === 'symbol' || key === 'address' || key === 'bytes' || key === 'binary') {
    return unwrapScValLike(inner);
  }

  if (key === 'vec') {
    return unwrapScValLike(inner);
  }

  if (key === 'bool') {
    return Boolean(inner);
  }

  if (key === 'u32' || key === 'i32' || key === 'u64' || key === 'i64' || key === 'u128' || key === 'i128') {
    return typeof inner === 'number' ? inner : Number(inner);
  }

  return { [key]: unwrapScValLike(inner) };
}

export function normalizeProposalCallArgs(value: ProposalCallArgs | unknown): ProposalCallArgs {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((item) => {
    const decoded =
      typeof item === 'string'
        ? (() => {
            const trimmed = item.trim();
            if (
              (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
              (trimmed.startsWith('{') && trimmed.endsWith('}'))
            ) {
              try {
                return JSON.parse(trimmed) as unknown;
              } catch {
                return item;
              }
            }
            return item;
          })()
        : item;

    return Array.isArray(decoded)
      ? (unwrapScValLike(decoded) as ProposalCallArg[])
      : [unwrapScValLike(decoded) as ProposalCallArg];
  });
}

function encodeAddress(value: ProposalCallArg) {
  return nativeToScVal(String(value), { type: 'address' });
}

function encodeU32(value: ProposalCallArg) {
  return nativeToScVal(Number(value), { type: 'u32' });
}

function encodeI128(value: ProposalCallArg) {
  return nativeToScVal(String(value), { type: 'i128' });
}

function encodeGeneric(value: ProposalCallArg) {
  return nativeToScVal(value);
}

function encodeProposalCallArg(functionName: string, index: number, value: ProposalCallArg) {
  if (functionName === 'mint') {
    return index === 0 || index === 1 ? encodeAddress(value) : encodeGeneric(value);
  }

  if (functionName === 'batch_mint') {
    if (index === 0 || index === 1) {
      return encodeAddress(value);
    }

    return index === 2 ? encodeU32(value) : encodeGeneric(value);
  }

  if (functionName === 'transfer') {
    if (index === 0 || index === 1) {
      return encodeAddress(value);
    }

    return index === 2 ? encodeI128(value) : encodeGeneric(value);
  }

  return encodeGeneric(value);
}

export function encodeProposalCallArgs(functions: string[], args: ProposalCallArgs | unknown): EncodedProposalCallArgs {
  return normalizeProposalCallArgs(args).map((callArgs, actionIndex) => {
    const functionName = functions[actionIndex] ?? '';
    return callArgs.map((arg, argIndex) => encodeProposalCallArg(functionName, argIndex, arg));
  });
}

export function buildMintProposalCall(
  recipient: string,
  tokenContractId: string,
  treasuryContractId: string
): {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
} {
  return {
    targets: [tokenContractId],
    functions: ['mint'],
    args: [[treasuryContractId, recipient]]
  };
}

function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Convert decimal amount to stroops (multiply by 10^7)
 * @param amount - Decimal amount as string (e.g., "100.5")
 * @returns Amount in stroops as bigint, or null if invalid
 */
function parseDecimalToStroops(amount: string): bigint | null {
  const trimmed = amount.trim();

  // Validate format: optional negative, digits, optional decimal point and digits
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const value = parseFloat(trimmed);

  // Check for negative or zero
  if (value <= 0 || !isFinite(value)) {
    return null;
  }

  // Convert to stroops (7 decimal places)
  // Multiply by 10^7 and round to avoid floating point errors
  const stroops = Math.round(value * 10_000_000);

  return BigInt(stroops);
}

export function getProposalActionLabel(type: ProposalActionType) {
  if (type === 'batch-mint-governance-token') {
    return 'Batch Mint Governance Token';
  }
  if (type === 'transfer-sac-token') {
    return 'Transfer SAC Token';
  }
  return 'Mint Governance Token';
}

export function getProposalActionSummary(action: ProposalQueuedAction) {
  if (action.type === 'batch-mint-governance-token') {
    return `${getProposalActionLabel(action.type)} to ${action.recipient} for ${action.amount} tokens`;
  }
  if (action.type === 'transfer-sac-token') {
    return `Transfer ${action.amount} ${action.assetCode || 'tokens'} to ${action.recipient}`;
  }
  return `${getProposalActionLabel(action.type)} to ${action.recipient}`;
}

export function buildProposalCallVectors(
  actions: ProposalQueuedAction[],
  tokenContractId: string,
  treasuryContractId: string
): ProposalCallVectors {
  const targets: string[] = [];
  const functions: string[] = [];
  const args: ProposalCallArgs = [];

  for (const action of actions) {
    if (action.type === 'batch-mint-governance-token') {
      const amount = parsePositiveInteger(action.amount);
      if (amount === null) {
        throw new Error('Batch mint amount must be a positive whole number.');
      }

      targets.push(tokenContractId);
      functions.push('batch_mint');
      args.push([treasuryContractId, action.recipient, amount]);
      continue;
    }

    if (action.type === 'transfer-sac-token') {
      if (!action.assetContractId) {
        throw new Error('Asset contract ID is required for SAC token transfer.');
      }

      const amountStroops = parseDecimalToStroops(action.amount);
      if (amountStroops === null) {
        throw new Error('Transfer amount must be a positive decimal number.');
      }

      targets.push(action.assetContractId);
      functions.push('transfer');
      // SAC transfer: (from: Address, to: Address, amount: i128)
      args.push([treasuryContractId, action.recipient, amountStroops.toString()]);
      continue;
    }

    targets.push(tokenContractId);
    functions.push('mint');
    args.push([treasuryContractId, action.recipient]);
  }

  return { targets, functions, args };
}
