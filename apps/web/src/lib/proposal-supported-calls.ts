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
import type { ModuleKind } from '@/lib/modules/kinds';
import {
  type AuthArgType,
  type AuthNodeDraft,
  authNodeSpecValue,
  isTypedAuthArg,
  type TypedAuthArg,
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
> & {
  /**
   * Modules an earlier action of the same proposal creates (`Manager.create_module`), by their
   * predicted address, so a later action (register, allowance, open) can call them before they
   * exist. The proposal's own `create_module` calls are the only source.
   */
  pendingModules?: Readonly<Record<string, ModuleKind>>;
};

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
    'register_module',
    'unregister_module',
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
    // The Treasury buys an escrowed listing; it follows a Treasury `authorize` action.
    'buy',
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

type ContractRole = keyof typeof supported;

const CLIENTS = {
  token: TokenClient,
  governor: GovernorClient,
  auction: AuctionClient,
  treasury: TreasuryClient,
  marketplace: MarketplaceClient,
  metadata: MetadataClient,
  claims: ClaimMinterClient
};

/** Which of this DAO's contracts an address is, including modules the same proposal creates. */
function contractRole(target: string, config: ProposalEncodingContext): ContractRole | null {
  if (!target) return null;
  const pending = config.pendingModules?.[target];
  if (pending) return pending as ContractRole;
  const byAddress: Array<[string | undefined, ContractRole]> = [
    [config.tokenContractId, 'token'],
    [config.governorContractId, 'governor'],
    [config.auctionContractId, 'auction'],
    [config.treasuryContractId, 'treasury'],
    [config.marketplaceContractId, 'marketplace'],
    [config.metadataContractId, 'metadata'],
    [config.claimsContractId, 'claims']
  ];
  return byAddress.find(([address]) => address && address === target)?.[1] ?? null;
}

function roleSpec(role: ContractRole, target: string, config: ProposalEncodingContext): Spec {
  return new CLIENTS[role]({ contractId: target, rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase }).spec;
}

/** An asset the treasury holds (its Stellar Asset Contract), XLM included. */
function isTreasuryAsset(target: string, config: ProposalEncodingContext) {
  return getTreasuryAssets(config.name).some(
    (asset) => (asset.isNative ? Asset.native().contractId(config.passphrase) : asset.contractId) === target
  );
}

const AUTH_ARG_TYPES: Partial<Record<string, AuthArgType>> = {
  scSpecTypeAddress: 'address',
  scSpecTypeI128: 'i128',
  scSpecTypeU128: 'u128',
  scSpecTypeU32: 'u32',
  scSpecTypeU64: 'u64',
  scSpecTypeSymbol: 'symbol',
  scSpecTypeString: 'string',
  scSpecTypeBool: 'bool'
};

/**
 * The argument types of the call an AuthNode authorizes, from that callee's own signature: a
 * treasury asset's `transfer(from, to, amount)`, or a function of one of this DAO's contracts.
 * Anything else has no known signature, so its arguments stay untyped and encoding refuses them.
 */
function authorizedCallTypes(contract: string, fnName: string, config: ProposalEncodingContext): AuthArgType[] | null {
  if (isTreasuryAsset(contract, config)) return fnName === 'transfer' ? ['address', 'address', 'i128'] : null;
  const role = contractRole(contract, config);
  if (!role) return null;
  const spec = roleSpec(role, contract, config);
  if (!spec.funcs().some((entry) => entry.name.toString() === fnName)) return null;
  const types = spec.getFunc(fnName).inputs.map((input) => AUTH_ARG_TYPES[input.type.type]);
  return types.every((type): type is AuthArgType => Boolean(type)) ? types : null;
}

function typedAuthArg(value: unknown, type: AuthArgType): TypedAuthArg {
  if (type === 'bool') {
    if (typeof value !== 'boolean') throw new Error('Expected a boolean authorization argument.');
    return { type, value };
  }
  if (type === 'address' || type === 'symbol' || type === 'string') {
    if (typeof value !== 'string') throw new Error(`Expected a ${type} authorization argument.`);
    return { type, value };
  }
  return { type, value: integer(value) };
}

/**
 * `AuthNode.args` is `Vec<Val>`, and the indexer records those values without their types (an
 * i128 amount reads as "950000"), so an indexed authorize call cannot be rebuilt as it is. The
 * Treasury only authorizes a call whose arguments equal what the callee receives, so the callee's
 * signature gives each argument's type exactly. Drafts and already-typed arguments pass through.
 */
function typeAuthNodes(nodes: unknown, config: ProposalEncodingContext): unknown {
  if (!Array.isArray(nodes)) return nodes;
  return nodes.map((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || 'fnName' in node) return node;
    const { contract, fn_name: fnName, args, sub } = node as Record<string, unknown>;
    const typedSub = typeAuthNodes(sub, config);
    if (!Array.isArray(args) || args.every((arg) => arg instanceof xdr.ScVal || isTypedAuthArg(arg)))
      return { ...node, sub: typedSub };
    const types =
      typeof contract === 'string' && typeof fnName === 'string' ? authorizedCallTypes(contract, fnName, config) : null;
    if (!types || types.length !== args.length)
      throw new Error(
        `Untyped authorization arguments for ${String(contract)}.${String(fnName)}; submission is disabled.`
      );
    return { ...node, args: args.map((arg, i) => typedAuthArg(arg, types[i]!)), sub: typedSub };
  });
}

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
  if (type.type === 'scSpecTypeUdt' && spec.findEntry(type.udt.name.toString()).type === 'scSpecEntryUdtUnionV0') {
    // A union arrives as the indexer's array (`['Marketplace', { … }]`) or as `{ tag, values }`.
    const entry = spec.findEntry(type.udt.name.toString());
    if (entry.type !== 'scSpecEntryUdtUnionV0') throw new Error('Expected a union argument.');
    const unionName = type.udt.name.toString();
    const parts = Array.isArray(value)
      ? { tag: value[0], values: value.slice(1) }
      : value && typeof value === 'object' && 'tag' in value
        ? {
            tag: (value as { tag: unknown }).tag,
            values: ((value as { values?: unknown[] }).values ?? []) as unknown[]
          }
        : null;
    if (!parts || typeof parts.tag !== 'string') throw new Error(`Expected a ${unionName} argument.`);
    const found = entry.udtUnionV0.cases.find(
      (c) => (c.type === 'scSpecUdtUnionCaseVoidV0' ? c.voidCase.name : c.tupleCase.name).toString() === parts.tag
    );
    if (!found) throw new Error(`Unknown ${unionName} case ${parts.tag}.`);
    if (found.type === 'scSpecUdtUnionCaseVoidV0') {
      if (parts.values.length) throw new Error(`${parts.tag} takes no values.`);
      return { tag: parts.tag };
    }
    const types = found.tupleCase.type;
    if (parts.values.length !== types.length) throw new Error(`${parts.tag} takes ${types.length} value(s).`);
    return { tag: parts.tag, values: types.map((t, i) => specValue(parts.values[i], t, spec)) };
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
    if (fn !== 'change_slug' && fn !== 'create_module')
      throw new Error(`Unsupported Manager call ${fn}; submission is disabled.`);
    const spec = new ManagerClient({
      contractId: target,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    if (fn === 'create_module') {
      // The Manager deploys a module for one DAO: this one, named first.
      if (args.length !== 3 || args[0] !== config.tokenContractId)
        throw new Error('A new module must be added to this DAO.');
      const inputs = spec.getFunc('create_module').inputs;
      return spec.funcArgsToScVals(
        fn,
        Object.fromEntries(inputs.map((input, i) => [input.name.toString(), specValue(args[i], input.type, spec)]))
      );
    }
    if (args.length !== 2 || args[0] !== config.tokenContractId) throw new Error('A slug change must name this DAO.');
    if (typeof args[1] !== 'string') throw new Error('Expected a string proposal argument.');
    return spec.funcArgsToScVals(fn, { token_address: args[0], new_slug: args[1] });
  }
  const role = contractRole(target, config);
  if (role && (supported[role] as readonly string[]).includes(fn)) {
    const spec = roleSpec(role, target, config);
    // `authorize` is not an entry point: Treasury.execute intercepts it as a
    // self-call. Its one Vec<AuthNode> argument has check_authorization's shape.
    const authorize = role === 'treasury' && fn === 'authorize';
    const specFn = authorize ? 'check_authorization' : fn;
    const inputs = spec.getFunc(specFn).inputs;
    if (args.length !== inputs.length) throw new Error(`Unsupported argument count for ${role}.${fn}.`);
    const values = authorize ? [typeAuthNodes(args[0], config)] : args;
    return spec.funcArgsToScVals(
      specFn,
      Object.fromEntries(inputs.map((input, i) => [input.name.toString(), specValue(values[i], input.type, spec)]))
    );
  }
  if (isTreasuryAsset(target, config) && fn === 'transfer' && args.length === 3) {
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
