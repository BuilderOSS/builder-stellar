import { keccak_256 } from '@noble/hashes/sha3.js';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

import { mintTitle } from '@/lib/contract-call-labels';
import { parseProfile, plainSummary } from '@/lib/dao-profile';
import { MODULE_LABELS, moduleLabelInSentence } from '@/lib/module-updates';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type {
  BuildContext,
  ProposalQueuedAction as RegisteredProposalQueuedAction
} from '@/lib/proposal-actions/types';
import { encodeSupportedCall, type ProposalEncodingContext } from '@/lib/proposal-supported-calls';
import { describeAuthNodes } from '@/lib/treasury-authorize';

export type ProposalCallArg = string | number | boolean | null | ProposalCallArg[] | { [key: string]: ProposalCallArg };

export type ProposalCallArgs = ProposalCallArg[][];
export type EncodedProposalCallArgs = xdr.ScVal[][];

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
  if (key === 'map') {
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) return unwrapScValLike(inner);
    if (!Array.isArray(inner)) throw new Error('Invalid indexed map.');
    const pairs = inner.map((entry) => {
      const pair = Array.isArray(entry) ? entry : [entry?.key, entry?.val ?? entry?.value];
      if (pair.length !== 2) throw new Error('Invalid indexed map entry.');
      const name = unwrapScValLike(pair[0]);
      if (typeof name !== 'string') throw new Error('Expected a string/symbol struct key.');
      return [name, unwrapScValLike(pair[1])] as const;
    });
    if (new Set(pairs.map(([name]) => name)).size !== pairs.length) throw new Error('Duplicate indexed map key.');
    return Object.fromEntries(pairs);
  }

  if (key === 'bool') {
    if (typeof inner !== 'boolean') throw new Error('Invalid indexed boolean.');
    return inner;
  }

  if (key === 'u32' || key === 'i32' || key === 'u64' || key === 'i64' || key === 'u128' || key === 'i128') {
    if (typeof inner === 'number' && !Number.isSafeInteger(inner)) throw new Error('Unsafe indexed integer.');
    return key === 'u32' || key === 'i32' ? Number(inner) : String(inner);
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

export function encodeProposalCallArgs(
  targets: string[],
  functions: string[],
  args: ProposalCallArgs | unknown,
  config: ProposalEncodingContext
): EncodedProposalCallArgs {
  const normalized = normalizeProposalCallArgs(args);
  if (!targets.length || targets.length !== functions.length || targets.length !== normalized.length)
    throw new Error('Invalid proposal call vector lengths.');
  return normalized.map((callArgs, i) => encodeSupportedCall(targets[i]!, functions[i]!, callArgs, config));
}

/** stellar_governance::governor::hash_proposal: three XDR values then raw description hash. */
export function proposalCallId(
  targets: string[],
  functions: string[],
  args: EncodedProposalCallArgs,
  descriptionHash: Uint8Array
): string {
  if (descriptionHash.length !== 32) throw new Error('Expected a 32-byte description hash.');
  const values = [
    nativeToScVal(targets, { type: 'address' }),
    nativeToScVal(functions, { type: 'symbol' }),
    xdr.ScVal.scvVec(args.map((call) => xdr.ScVal.scvVec(call)))
  ];
  return Buffer.from(
    keccak_256(Buffer.concat([...values.map((value) => Buffer.from(value.toXDR())), Buffer.from(descriptionHash)]))
  ).toString('hex');
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
    'change-mint-allowance': 'Change Mint Allowance',
    'set-transfers-locked': 'Lock Memberships',
    'set-members-only-delegation': 'Members-only Delegation',
    'set-dao-recovery': 'DAO Recovery',
    'set-transfer-agent': 'Change Transfer Agent',
    'dao-transfer': 'Recover a Membership',
    'approved-transfer': 'Approve a Membership Transfer',
    'set-voting-delay': 'Set Voting Delay',
    'set-voting-period': 'Set Voting Period',
    'set-queue-delay': 'Set Queue Delay',
    'set-proposal-threshold': 'Set Proposal Threshold',
    'set-quorum-bps': 'Set Quorum',
    'pause-auction': 'Pause Auction',
    'unpause-auction': 'Resume Auction',
    'set-auction-duration': 'Set Auction Duration',
    'set-auction-time-buffer': 'Set Auction Time Buffer',
    'set-auction-reserve-price': 'Set Auction Reserve Price',
    'set-auction-payment-token': 'Set Auction Payment Token',
    'set-auction-min-bid-increment': 'Set Auction Minimum Bid Increment',
    'cancel-auction': 'Cancel Paused Auction',
    'set-marketplace-payment-token': 'Set Marketplace Payment Asset',
    'set-marketplace-secondary-fee': 'Set Marketplace Secondary Fee',
    'pause-marketplace': 'Pause Marketplace',
    'unpause-marketplace': 'Resume Marketplace',
    'open-pool': 'Open Quick-buy Pool',
    'close-pool': 'Close Pool',
    'sweep-pool': 'Sweep Closed Pool',
    'add-artwork-properties': 'Append Artwork Properties and Items',
    'set-artwork-renderer': 'Update Artwork Renderer',
    'update-dao-profile': 'Update Community Profile',
    'set-token-metadata': 'Rename Community',
    'transfer-dao-token': 'Give Treasury Token',
    'change-dao-slug': 'Change Community Link',
    'upgrade-dao-module': 'Upgrade DAO Module',
    'migrate-dao-module': 'Migrate Module Storage',
    'regenerate-token-traits': 'Seed Token Traits',
    'treasury-authorize': 'Authorize Next Action (Treasury)',
    'treasury-buy-listing': 'Treasury Buys Listing',
    'open-claim-list': 'Open a Claim List'
  };

  if (labels[type]) return labels[type]!;
  if (type === 'batch-mint-governance-token') {
    return 'Mint membership tokens';
  }
  if (type === 'transfer-sac-token') {
    return 'Transfer SAC Token';
  }
  return 'Mint a membership token';
}

function moduleLabel(module: unknown) {
  const key = String(module);
  return key in MODULE_LABELS ? moduleLabelInSentence(key as keyof typeof MODULE_LABELS) : key;
}

function profileSummary(raw: string) {
  const profile = parseProfile(raw);
  const parts = [profile.description ? `“${plainSummary(profile.description, 80)}”` : 'no description'];
  if (profile.links.length) parts.push(`${profile.links.length} ${profile.links.length === 1 ? 'link' : 'links'}`);
  if (profile.image) parts.push('an image');
  return parts.join(', ');
}

export function getProposalActionSummary(action: ProposalQueuedAction) {
  if (action.type === 'set-token-metadata') return `Rename to ${action.name} (${action.symbol})`;
  if (action.type === 'change-dao-slug')
    return `Change link${action.previousSlug ? ` from /dao/${action.previousSlug}` : ''} to /dao/${action.slug}. The old link is freed right away and keeps leading here only until another community takes it. If /dao/${action.slug} is taken before this runs, the proposal fails.`;
  if (action.type === 'transfer-dao-token')
    return `Give token #${action.tokenId} from the treasury to ${action.recipient}`;
  if (action.type === 'open-claim-list')
    return `Open a claim list of ${action.total} tokens at ${action.price} base units each, closing ${new Date(Number(action.expiresAt) * 1000).toISOString()}; the full list is at ${action.treeUri}`;
  if (action.type === 'change-mint-allowance')
    return `${action.direction === 'decrease' ? 'Lower' : 'Raise'} the mint allowance of ${action.module || action.recipient} by ${action.amount} tokens`;
  if (action.type === 'set-transfers-locked')
    return action.enabled
      ? 'Lock memberships: tokens move only by sale from the community, by giving them back to the DAO or by a DAO vote'
      : 'Unlock memberships: members can transfer and sell their tokens';
  if (action.type === 'set-members-only-delegation')
    return action.enabled ? 'Allow delegating votes to members only' : 'Allow delegating votes to anyone';
  if (action.type === 'set-dao-recovery')
    return action.enabled ? 'Turn DAO recovery on: a vote can move any membership' : 'Turn DAO recovery off';
  if (action.type === 'set-transfer-agent')
    return `${action.enabled === false ? 'Stop' : 'Let'} ${action.module || action.recipient} ${action.enabled === false ? 'moving' : 'move'} memberships with the member’s signature`;
  if (action.type === 'dao-transfer')
    return `Move token #${action.tokenId} to ${action.to || action.recipient} by DAO recovery`;
  if (action.type === 'approved-transfer')
    return `Move token #${action.tokenId} from ${action.from} to ${action.to || action.recipient} with the member’s approval`;
  if (action.type === 'add-artwork-properties')
    return `${getProposalActionLabel(action.type)}: ${Array.isArray(action.names) ? action.names.length : 0} new properties, ${Array.isArray(action.items) ? action.items.length : 0} ordered items (${action.ipfsGroup?.base_uri ?? 'IPFS reference unavailable'})`;
  if (action.type === 'upgrade-dao-module')
    return `Upgrade ${moduleLabel(action.module)} from release ${action.fromHash} to ${action.toHash}`;
  if (action.type === 'migrate-dao-module')
    return `Update storage for ${moduleLabel(action.module)} to the new release`;
  if (action.type === 'regenerate-token-traits') return `Seed traits for token #${action.tokenId}`;
  if (action.type === 'treasury-authorize')
    return `Authorize the next action: ${Array.isArray(action.nodes) ? describeAuthNodes(action.nodes).join('; ') : 'no nodes'}`;
  if (action.type === 'treasury-buy-listing')
    return `Treasury buys listed token #${action.tokenId} for at most ${action.maxPrice} base units`;
  if (action.type === 'set-artwork-renderer') return `${getProposalActionLabel(action.type)} to ${action.value}`;
  if (action.type === 'update-dao-profile')
    return `Replace the community profile (revision ${action.expectedSeq}) with: ${profileSummary(String(action.profile ?? ''))}`;
  if (
    action.type === 'set-voting-delay' ||
    action.type === 'set-voting-period' ||
    action.type === 'set-queue-delay' ||
    action.type === 'set-proposal-threshold' ||
    action.type === 'set-quorum-bps'
  ) {
    return `${getProposalActionLabel(action.type)} to ${action.value || action.amount}`;
  }
  if (
    action.type === 'pause-auction' ||
    action.type === 'unpause-auction' ||
    action.type === 'pause-marketplace' ||
    action.type === 'unpause-marketplace' ||
    action.type === 'cancel-auction'
  ) {
    return getProposalActionLabel(action.type);
  }
  if (action.type === 'set-auction-reserve-price') {
    return `${getProposalActionLabel(action.type)} to ${action.reservePrice || action.amount}`;
  }
  if (action.type === 'set-auction-duration' || action.type === 'set-auction-time-buffer') {
    return `${getProposalActionLabel(action.type)} to ${action.value || action.amount} seconds`;
  }
  if (action.type === 'set-auction-payment-token' || action.type === 'set-marketplace-payment-token') {
    return `${getProposalActionLabel(action.type)} to ${action.paymentToken || action.recipient}`;
  }
  if (action.type === 'set-marketplace-secondary-fee')
    return `${getProposalActionLabel(action.type)} to ${action.value || action.amount} bps`;
  if (action.type === 'set-auction-min-bid-increment')
    return `${getProposalActionLabel(action.type)} to ${action.value || action.amount}%`;
  if (action.type === 'open-pool')
    return `${getProposalActionLabel(action.type)}: ${action.size} tokens at ${action.price}, at most ${action.maxPerBuyer} per wallet, closing ${action.expiresAt}`;
  if (action.type === 'close-pool' || action.type === 'sweep-pool')
    return `${getProposalActionLabel(action.type)} #${action.poolId}`;
  if (action.type === 'batch-mint-governance-token') {
    return /^\d+$/.test(String(action.amount))
      ? mintTitle([{ recipient: action.recipient, amount: BigInt(action.amount) }])
      : `Mint ${action.amount} membership tokens to ${action.recipient}`;
  }
  if (action.type === 'mint-governance-token') return mintTitle([{ recipient: action.recipient, amount: 1n }]);
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
