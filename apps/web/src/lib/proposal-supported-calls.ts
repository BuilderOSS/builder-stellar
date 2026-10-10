import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Asset, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { Spec } from '@stellar/stellar-sdk/contract';
import { Buffer } from 'buffer';

import { getTreasuryAssets } from '@/lib/assets-config';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { assertMinterSpec } from '@/lib/minter/client';

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
  | 'minterContractId'
  | 'minterSpec'
>;

const supported = {
  token: ['mint', 'batch_mint', 'transfer', 'set_mint_authority', 'upgrade', 'sync_version'],
  governor: [
    'set_voting_delay',
    'set_voting_period',
    'set_proposal_threshold',
    'set_quorum_bps',
    'set_queue_delay',
    'upgrade',
    'sync_version'
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
    'sync_version'
  ],
  treasury: ['upgrade', 'sync_version'],
  // Settings/artwork authority follows Token.get_owner, not Metadata's upgrade
  // owner. No getter exists for that upgrade owner: do not infer it here.
  metadata: [
    'add_properties',
    'update_renderer_base',
    'update_description',
    'update_project_uri',
    'update_contract_image'
  ],
  marketplace: [
    'create_primary_listing',
    'cancel_primary',
    'set_payment_asset',
    'set_secondary_fee_bps',
    'pause',
    'unpause',
    'upgrade',
    'sync_version'
  ]
} as const;

function integer(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('Unsafe integer in indexed proposal arguments.');
  if (!/^-?\d+$/.test(String(value))) throw new Error('Expected a whole-number proposal argument.');
  return String(value);
}

function specValue(value: unknown, type: xdr.ScSpecTypeDef, spec: Spec): unknown {
  const name = type.type;
  if (type.type === 'scSpecTypeVec') {
    if (!Array.isArray(value))
      throw new Error('Expected a vector proposal argument (obsolete scalar ABI is unsupported).');
    return value.map((item) => specValue(item, type.vec.elementType, spec));
  }
  if (type.type === 'scSpecTypeUdt') {
    const name = type.udt.name.toString();
    const entry = spec.findEntry(name);
    if (entry.type !== 'scSpecEntryUdtStructV0' || !value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Expected ${name} struct argument.`);
    const fields = entry.udtStructV0.fields;
    const object = value as Record<string, unknown>;
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
  if (config.minterContractId && target === config.minterContractId) {
    if (!['set_merkle_root', 'set_allowlist', 'mint_batch'].includes(fn) || !config.minterSpec?.length)
      throw new Error('Unsupported or unavailable trusted Minter ABI.');
    if (args[0] !== config.tokenContractId) throw new Error('Minter allocation token must match this DAO.');
    const spec = new Spec(config.minterSpec);
    assertMinterSpec(spec);
    const inputs = spec.getFunc(fn).inputs;
    if (args.length !== inputs.length) throw new Error('Invalid Minter allocation argument count.');
    return spec.funcArgsToScVals(
      fn,
      Object.fromEntries(inputs.map((input, i) => [input.name.toString(), specValue(args[i], input.type, spec)]))
    );
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
                : null;
  if (role === 'metadata' && (fn === 'upgrade' || fn === 'sync_version'))
    throw new Error('Metadata upgrade authority has no public getter; submission is disabled.');
  if (role && (supported[role] as readonly string[]).includes(fn)) {
    const Clients = {
      token: TokenClient,
      governor: GovernorClient,
      auction: AuctionClient,
      treasury: TreasuryClient,
      marketplace: MarketplaceClient,
      metadata: MetadataClient
    };
    const spec: Spec = new Clients[role]({
      contractId: target,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    const inputs = spec.getFunc(fn).inputs;
    if (args.length !== inputs.length) throw new Error(`Unsupported argument count for ${role}.${fn}.`);
    return spec.funcArgsToScVals(
      fn,
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
