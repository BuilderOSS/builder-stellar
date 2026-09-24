import { nativeToScVal } from '@stellar/stellar-sdk';

import { getActionHandler } from '@/lib/proposal-actions/registry';
import type {
  BuildContext,
  ProposalQueuedAction as RegisteredProposalQueuedAction
} from '@/lib/proposal-actions/types';

export type ProposalCallArg = string | number | boolean | null | ProposalCallArg[] | { [key: string]: ProposalCallArg };

export type ProposalCallArgs = ProposalCallArg[][];
export type EncodedProposalCallArgs = unknown[][];

export type ProposalActionType = RegisteredProposalQueuedAction['type'];
export type ProposalQueuedAction = RegisteredProposalQueuedAction;

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

function encodeU128(value: ProposalCallArg) {
  return nativeToScVal(String(value), { type: 'u128' });
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

  if (
    functionName === 'set_mint_authority' ||
    functionName === 'set_governor_authority' ||
    functionName === 'set_voting_delay' ||
    functionName === 'set_voting_period' ||
    functionName === 'set_proposal_threshold' ||
    functionName === 'set_quorum_bps' ||
    functionName === 'pause' ||
    functionName === 'unpause'
  ) {
    if (index === 0) return encodeAddress(value);
    if (functionName === 'set_mint_authority' || functionName === 'set_governor_authority') return encodeGeneric(value);
    if (functionName === 'set_proposal_threshold') return encodeU128(value);
    return encodeU32(value);
  }

  if (functionName === 'set_reserve_price') return encodeI128(value);
  if (functionName === 'set_payment_token') return encodeAddress(value);

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

export function getProposalActionLabel(type: ProposalActionType) {
  const labels: Partial<Record<ProposalActionType, string>> = {
    'set-mint-authority': 'Set Mint Authority',
    'set-governor-authority': 'Set Governor Authority',
    'set-voting-delay': 'Set Voting Delay',
    'set-voting-period': 'Set Voting Period',
    'set-proposal-threshold': 'Set Proposal Threshold',
    'set-quorum-bps': 'Set Quorum',
    'pause-auction': 'Pause Auction',
    'unpause-auction': 'Resume Auction',
    'set-auction-reserve-price': 'Set Auction Reserve Price',
    'set-auction-payment-token': 'Set Auction Payment Token'
  };

  if (labels[type]) return labels[type]!;
  if (type === 'batch-mint-governance-token') {
    return 'Batch Mint Governance Token';
  }
  if (type === 'transfer-sac-token') {
    return 'Transfer SAC Token';
  }
  return 'Mint Governance Token';
}

export function getProposalActionSummary(action: ProposalQueuedAction) {
  if (action.type === 'set-mint-authority' || action.type === 'set-governor-authority') {
    return `${action.enabled === false ? 'Revoke' : 'Grant'} ${getProposalActionLabel(action.type)} for ${action.authority || action.recipient}`;
  }
  if (
    action.type === 'set-voting-delay' ||
    action.type === 'set-voting-period' ||
    action.type === 'set-proposal-threshold' ||
    action.type === 'set-quorum-bps'
  ) {
    return `${getProposalActionLabel(action.type)} to ${action.value || action.amount}`;
  }
  if (action.type === 'pause-auction' || action.type === 'unpause-auction') {
    return getProposalActionLabel(action.type);
  }
  if (action.type === 'set-auction-reserve-price') {
    return `${getProposalActionLabel(action.type)} to ${action.reservePrice || action.amount}`;
  }
  if (action.type === 'set-auction-payment-token') {
    return `${getProposalActionLabel(action.type)} to ${action.paymentToken || action.recipient}`;
  }
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
  treasuryContractId: string,
  config?: BuildContext['config']
): ProposalCallVectors {
  const buildContext: BuildContext = {
    config: config ?? ({} as BuildContext['config']),
    governorContractId: config?.governorContractId ?? '',
    tokenContractId,
    treasuryAddress: treasuryContractId
  };

  const calls = actions.map((action) => {
    const handler = getActionHandler(action.type as RegisteredProposalQueuedAction['type']);
    return handler.buildCallVector(handler.deserialize(action), buildContext);
  });

  return {
    targets: calls.map((call) => call.target),
    functions: calls.map((call) => call.function),
    args: calls.map((call) => call.args)
  };
}
