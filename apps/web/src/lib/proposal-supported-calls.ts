import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as ClaimMinterClient } from '@builder-stellar/claim-minter-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Asset, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { Spec } from '@stellar/stellar-sdk/contract';
import { Buffer } from 'buffer';

import { getTreasuryAssets } from '@/lib/assets-config';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import {
  type AuthNodeDraft,
  authNodeSpecValue,
  isTypedAuthArg,
  typedAuthArgToScVal,
  validateAuthNodes
} from '@/lib/treasury-authorize';

export type ProposalEncodingContext = Pick<
  DaoNetworkConfig,
  | 'name'
  | 'rpcUrl'
  | 'passphrase'
  | 'tokenContractId'
  | 'governorContractId'
  | 'treasuryContractId'
  | 'auctionContractId'
  | 'marketplaceContractId'
  | 'metadataContractId'
  | 'claimsContractId'
>;

const supported = {
  token: [
    'mint',
    'batch_mint',
    'transfer',
    'transfer_from',
    'increase_mint_allowance',
    'decrease_mint_allowance',
    'set_transfers_locked',
    'set_members_only_delegation',
    'set_dao_recovery',
    'set_transfer_agent',
    'dao_transfer',
    'set_metadata',
    'upgrade',
    'migrate'
  ],
  governor: [
    'set_voting_delay',
    'set_voting_period',
    'set_proposal_threshold',
    'set_quorum_bps',
    'set_queue_delay',
    'upgrade',
    'migrate'
  ],
  auction: [
    'pause',
    'unpause',
    'set_duration',
    'set_time_buffer',
    'set_reserve_price',
    'set_payment_token',
    'set_min_bid_increment',
    'cancel_auction',
    'upgrade',
    'migrate'
  ],
  // Treasury self-calls are limited to these by the contract; `authorize`
  // attaches a nested authorization tree to the next action.
  treasury: ['upgrade', 'migrate', 'authorize'],
  // Metadata has its own admin() (launch admin, then the Treasury).
  metadata: ['add_properties', 'update_renderer_base', 'update_profile', 'regenerate', 'upgrade', 'migrate'],
  marketplace: [
    'open_pool',
    'close_pool',
    'sweep_pool',
    'set_payment_asset',
    'set_secondary_fee_bps',
    'pause',
    'unpause',
    'upgrade',
    'migrate'
  ],
  // The DAO's ClaimMinter: open a claim list (after granting it an allowance), upgrade it.
  claims: ['open_list', 'upgrade', 'migrate']
} as const;

function integer(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('Unsafe integer in indexed proposal arguments.');
  if (!/^-?\d+$/.test(String(value))) throw new Error('Expected a whole-number proposal argument.');
  return String(value);
}

function specValue(value: unknown, type: xdr.ScSpecTypeDef, spec: Spec): unknown {
  const name = type.type;
  // Val arguments (e.g. AuthNode.args) must carry an explicit type; never guess.
  if (name === 'scSpecTypeVal') {
    if (value instanceof xdr.ScVal) return value;
    if (isTypedAuthArg(value)) return typedAuthArgToScVal(value);
    throw new Error('Untyped Val argument; submission is disabled.');
  }
  if (type.type === 'scSpecTypeOption') {
    return value === null || value === undefined ? null : specValue(value, type.option.valueType, spec);
  }
  if (type.type === 'scSpecTypeVec') {
    if (!Array.isArray(value))
      throw new Error('Expected a vector proposal argument (obsolete scalar ABI is unsupported).');
    return value.map((item) => specValue(item, type.vec.elementType, spec));
  }
  if (type.type === 'scSpecTypeUdt') {
    const name = type.udt.name.toString();
    // A guided AuthNode draft (fnName, typed args) becomes the AuthNode struct.
    let input = value;
    if (name === 'AuthNode' && value && typeof value === 'object' && 'fnName' in value) {
      const error = validateAuthNodes([value as AuthNodeDraft]);
      if (error) throw new Error(error);
      input = authNodeSpecValue(value as AuthNodeDraft);
    }
    const entry = spec.findEntry(name);
    if (entry.type !== 'scSpecEntryUdtStructV0' || !input || typeof input !== 'object' || Array.isArray(input))
      throw new Error(`Expected ${name} struct argument.`);
    const fields = entry.udtStructV0.fields;
    const object = input as Record<string, unknown>;
    const names = fields.map((field) => field.name.toString());
    if (Object.keys(object).length !== fields.length || names.some((field) => !Object.hasOwn(object, field)))
      throw new Error(`Invalid ${name} struct fields.`);
    return Object.fromEntries(
      fields.map((field) => [field.name.toString(), specValue(object[field.name.toString()], field.type, spec)])
    );
  }
  if (type.type === 'scSpecTypeBytesN') {
    if (typeof value !== 'string') throw new Error('Expected a hex or base64 BytesN argument.');
    const hex = value.replace(/^0x/, '');
    const bytes =
      /^[0-9a-f]+$/i.test(hex) && hex.length === type.bytesN.n * 2
        ? Buffer.from(hex, 'hex')
        : Buffer.from(value, 'base64');
    if (bytes.length !== type.bytesN.n) throw new Error('Invalid BytesN argument length.');
    return bytes;
  }
  if (/^scSpecType[UI](32|64|128|256)$/.test(name)) {
    const text = integer(value);
    const bits = BigInt(name.match(/\d+$/)![0]);
    const signed = name.startsWith('scSpecTypeI');
    const number = BigInt(text);
    const min = signed ? -(1n << (bits - 1n)) : 0n;
    const max = (1n << (signed ? bits - 1n : bits)) - 1n;
    if (number < min || number > max) throw new Error(`Integer out of range for ${name}.`);
    return name.endsWith('32') ? Number(text) : BigInt(text);
  }
  if (name === 'scSpecTypeBool' && typeof value !== 'boolean') throw new Error('Expected a boolean proposal argument.');
  if ((name === 'scSpecTypeString' || name === 'scSpecTypeSymbol') && typeof value !== 'string')
    throw new Error('Expected a string proposal argument.');
  return value;
}

/** Fail closed: a method name is not an ABI, and an arbitrary target is not a SAC. */
export function encodeSupportedCall(
  target: string,
  fn: string,
  args: unknown[],
  config: ProposalEncodingContext
): xdr.ScVal[] {
  // The shared Manager: only a DAO's own slug change (the Manager checks the caller is its token admin).
  if (target && target === getDeploymentConfig().managerAddress) {
    if (fn !== 'change_slug') throw new Error(`Unsupported Manager call ${fn}; submission is disabled.`);
    if (args.length !== 2 || args[0] !== config.tokenContractId) throw new Error('A slug change must name this DAO.');
    if (typeof args[1] !== 'string') throw new Error('Expected a string proposal argument.');
    const spec = new ManagerClient({
      contractId: target,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    return spec.funcArgsToScVals(fn, { token_address: args[0], new_slug: args[1] });
  }
  const role =
    target && target === config.tokenContractId
      ? 'token'
      : target && target === config.governorContractId
        ? 'governor'
        : target && target === config.auctionContractId
          ? 'auction'
          : target && target === config.treasuryContractId
            ? 'treasury'
            : target && target === config.marketplaceContractId
              ? 'marketplace'
              : target && target === config.metadataContractId
                ? 'metadata'
                : target && target === config.claimsContractId
                  ? 'claims'
                  : null;
  if (role && (supported[role] as readonly string[]).includes(fn)) {
    const Clients = {
      token: TokenClient,
      governor: GovernorClient,
      auction: AuctionClient,
      treasury: TreasuryClient,
      marketplace: MarketplaceClient,
      metadata: MetadataClient,
      claims: ClaimMinterClient
    };
    const spec: Spec = new Clients[role]({
      contractId: target,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    // `authorize` is not an entry point: Treasury.execute intercepts it as a
    // self-call. Its one Vec<AuthNode> argument has check_authorization's shape.
    const specFn = role === 'treasury' && fn === 'authorize' ? 'check_authorization' : fn;
    const inputs = spec.getFunc(specFn).inputs;
    if (args.length !== inputs.length) throw new Error(`Unsupported argument count for ${role}.${fn}.`);
    return spec.funcArgsToScVals(
      specFn,
      Object.fromEntries(inputs.map((input, i) => [input.name.toString(), specValue(args[i], input.type, spec)]))
    );
  }
  if (
    getTreasuryAssets(config.name).some(
      (asset) => (asset.isNative ? Asset.native().contractId(config.passphrase) : asset.contractId) === target
    ) &&
    fn === 'transfer' &&
    args.length === 3
  ) {
    return [
      nativeToScVal(args[0], { type: 'address' }),
      nativeToScVal(args[1], { type: 'address' }),
      nativeToScVal(BigInt(integer(args[2])), { type: 'i128' })
    ];
  }
  throw new Error(
    `Unsupported external call ${target}.${fn}. Its original ABI/XDR is unavailable; submission is disabled.`
  );
}
