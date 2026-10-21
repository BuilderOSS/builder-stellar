import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as ClaimMinterClient } from '@builder-stellar/claim-minter-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Address, Keypair, nativeToScVal, Networks, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';
import type { Spec } from '@stellar/stellar-sdk/contract';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';

import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { keccak256Bytes } from '@/lib/keccak';
import { buildProposalCallVectors, encodeProposalCallArgs, proposalCallId } from '@/lib/proposal-call';
import type { ProposalEncodingContext } from '@/lib/proposal-supported-calls';
import { treasuryPurchaseAuthNodes } from '@/lib/treasury-authorize';

import { getActionHandler, getAllActionHandlers } from './registry';
import type { FormContext, ProposalActionType, ProposalQueuedAction } from './types';

/**
 * Every registered action, end to end against the contract spec: the draft a form produces is
 * validated, serialized into the queue, rebuilt into a call vector and encoded, and the XDR must equal
 * what the generated bindings encode for the arguments the contract function takes. Encoding, not
 * execution: whether the call succeeds on chain is the contracts' own e2e tests' job.
 */

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const wallet = (byte: number) => Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(byte)).publicKey();
const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const MANAGER = getDeploymentConfig().managerAddress;
const NEW_MODULE = contract(20);
const alice = wallet(7);
const bob = wallet(8);
const FUTURE = 1_893_456_000; // 2030-01-01T00:00:00Z

const config: DaoNetworkConfig = {
  name: 'testnet',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  slug: 'night-owls',
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  auctionContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6),
  claimsContractId: contract(7),
  tokenSettings: { transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false },
  assuranceOutcome: null,
  assuranceDeadline: null,
  label: 'Night Owls',
  tokenName: 'Night Owls',
  tokenSymbol: 'OWL',
  profile: { description: '', links: [], image: '' },
  profileStatus: 'verified',
  profileSeq: 0,
  adminAddress: contract(3),
  launchAdmin: alice,
  image: '',
  auctionEnabled: true,
  auctionPaused: false,
  marketplaceEnabled: true,
  status: 'operational'
};

/** The contract each fixture's call must reach, and the bindings that describe it. */
const TARGETS = {
  token: [config.tokenContractId, TokenClient],
  governor: [config.governorContractId, GovernorClient],
  treasury: [config.treasuryContractId, TreasuryClient],
  auction: [config.auctionContractId, AuctionClient],
  marketplace: [config.marketplaceContractId, MarketplaceClient],
  metadata: [config.metadataContractId, MetadataClient],
  claims: [config.claimsContractId, ClaimMinterClient],
  manager: [MANAGER, ManagerClient],
  // A module the same proposal deploys (create_module), called at its predicted address.
  newAuction: [NEW_MODULE, AuctionClient],
  // The native asset's SAC: not ours, so no bindings; transfer(from, to, i128) by convention.
  xlm: [XLM, null]
} as const;
type TargetKey = keyof typeof TARGETS;

type Fixture = {
  name?: string;
  type: ProposalActionType;
  draft: Record<string, unknown>;
  target: TargetKey;
  fn: string;
  /** The arguments by the spec's own names, as the bindings take them. */
  expected: Record<string, unknown>;
  /** Form context changes, e.g. a tribe without the module a fixture adds. */
  config?: Partial<DaoNetworkConfig>;
  encoding?: Partial<ProposalEncodingContext>;
};

const hash = (byte: string) => byte.repeat(32);
const artwork = {
  names: ['Eyes'],
  items: [{ name: 'Round', is_new_property: true, property_id: 0 }],
  ipfsGroup: { base_uri: 'ipfs://bafyartwork', extension: '.png' }
};
const authNodes = [
  {
    contract: XLM,
    fnName: 'transfer',
    args: [
      { type: 'address', value: config.treasuryContractId },
      { type: 'address', value: config.marketplaceContractId },
      { type: 'i128', value: '5000000' }
    ],
    sub: []
  }
];
const profile = JSON.stringify({ description: 'Owls who build', links: [], image: '' });
const claimList = {
  type: 'open-claim-list',
  root: hash('ab'),
  treeUri: 'ipfs://bafyclaims',
  asset: XLM,
  price: '10000000',
  expiresAt: FUTURE,
  total: 12,
  claimsContractId: config.claimsContractId
};
const pool = {
  price: '1.5',
  asset: XLM,
  size: '10',
  maxPerBuyer: '2',
  maxSoldPerPeriod: '5',
  periodHours: '24',
  expiresAt: '2030-01-01T00:00'
};

const FIXTURES: Fixture[] = [
  // Membership tokens and treasury funds
  {
    type: 'mint-governance-token',
    draft: { recipient: alice, amount: '1' },
    target: 'token',
    fn: 'mint',
    expected: { minter: config.treasuryContractId, to: alice }
  },
  {
    type: 'batch-mint-governance-token',
    draft: { recipient: alice, amount: '3' },
    target: 'token',
    fn: 'batch_mint',
    expected: { minter: config.treasuryContractId, recipients: [alice], amounts: [3n] }
  },
  {
    name: 'batch-mint-governance-token (several wallets)',
    type: 'batch-mint-governance-token',
    draft: {
      recipient: alice,
      amount: '2',
      allocations: [
        { recipient: alice, amount: '2' },
        { recipient: bob, amount: '1' }
      ]
    },
    target: 'token',
    fn: 'batch_mint',
    expected: { minter: config.treasuryContractId, recipients: [alice, bob], amounts: [2n, 1n] }
  },
  {
    type: 'transfer-sac-token',
    draft: { recipient: alice, amount: '12.5', assetCode: 'XLM' },
    target: 'xlm',
    fn: 'transfer',
    expected: { from: config.treasuryContractId, to: alice, amount: 125_000_000n }
  },
  {
    type: 'transfer-dao-token',
    draft: { tokenId: '4', recipient: alice },
    target: 'token',
    fn: 'transfer',
    expected: { from: config.treasuryContractId, to: alice, token_id: 4 }
  },
  // Membership rules
  {
    type: 'change-mint-allowance',
    draft: { module: config.marketplaceContractId, amount: '10', direction: 'increase' },
    target: 'token',
    fn: 'increase_mint_allowance',
    expected: { module: config.marketplaceContractId, amount: 10 }
  },
  {
    name: 'change-mint-allowance (decrease)',
    type: 'change-mint-allowance',
    draft: { module: config.claimsContractId, amount: '3', direction: 'decrease' },
    target: 'token',
    fn: 'decrease_mint_allowance',
    expected: { module: config.claimsContractId, amount: 3 }
  },
  {
    type: 'set-transfers-locked',
    draft: { enabled: true },
    target: 'token',
    fn: 'set_transfers_locked',
    expected: { locked: true }
  },
  {
    type: 'set-members-only-delegation',
    draft: { enabled: false },
    target: 'token',
    fn: 'set_members_only_delegation',
    expected: { enabled: false }
  },
  {
    type: 'set-dao-recovery',
    draft: { enabled: true },
    target: 'token',
    fn: 'set_dao_recovery',
    expected: { enabled: true }
  },
  {
    type: 'set-transfer-agent',
    draft: { module: config.marketplaceContractId, enabled: true },
    target: 'token',
    fn: 'set_transfer_agent',
    expected: { module: config.marketplaceContractId, enabled: true }
  },
  {
    type: 'dao-transfer',
    draft: { tokenId: '9', to: bob },
    target: 'token',
    fn: 'dao_transfer',
    expected: { token_id: 9, to: bob }
  },
  {
    type: 'approved-transfer',
    draft: { tokenId: '9', from: alice, to: bob },
    target: 'token',
    fn: 'transfer_from',
    expected: { spender: config.treasuryContractId, from: alice, to: bob, token_id: 9 }
  },
  // Governance rules
  {
    type: 'set-voting-delay',
    draft: { value: '3600' },
    target: 'governor',
    fn: 'set_voting_delay',
    expected: { voting_delay: 3600 }
  },
  {
    type: 'set-voting-period',
    draft: { value: '86400' },
    target: 'governor',
    fn: 'set_voting_period',
    expected: { voting_period: 86400 }
  },
  {
    type: 'set-queue-delay',
    draft: { value: '172800' },
    target: 'governor',
    fn: 'set_queue_delay',
    expected: { queue_delay: 172800 }
  },
  {
    type: 'set-proposal-threshold',
    draft: { value: '5' },
    target: 'governor',
    fn: 'set_proposal_threshold',
    expected: { proposal_threshold: 5n }
  },
  {
    type: 'set-quorum-bps',
    draft: { value: '1250' },
    target: 'governor',
    fn: 'set_quorum_bps',
    expected: { quorum_bps: 1250 }
  },
  // Auction
  {
    type: 'pause-auction',
    draft: {},
    target: 'auction',
    fn: 'pause',
    expected: { caller: config.treasuryContractId }
  },
  {
    type: 'unpause-auction',
    draft: {},
    target: 'auction',
    fn: 'unpause',
    expected: { caller: config.treasuryContractId }
  },
  {
    type: 'set-auction-duration',
    draft: { value: '86400' },
    target: 'auction',
    fn: 'set_duration',
    expected: { duration: 86400n }
  },
  {
    type: 'set-auction-time-buffer',
    draft: { value: '300' },
    target: 'auction',
    fn: 'set_time_buffer',
    expected: { time_buffer: 300n }
  },
  {
    type: 'set-auction-reserve-price',
    draft: { reservePrice: '1.5' },
    target: 'auction',
    fn: 'set_reserve_price',
    expected: { reserve_price: 15_000_000n }
  },
  {
    type: 'set-auction-payment-token',
    draft: { paymentToken: USDC },
    target: 'auction',
    fn: 'set_payment_token',
    expected: { payment_token: USDC }
  },
  {
    type: 'set-auction-min-bid-increment',
    draft: { value: '10' },
    target: 'auction',
    fn: 'set_min_bid_increment',
    expected: { min_bid_increment_percent: 10 }
  },
  { type: 'cancel-auction', draft: {}, target: 'auction', fn: 'cancel_auction', expected: {} },
  // Market
  {
    type: 'set-marketplace-payment-token',
    draft: { paymentToken: USDC },
    target: 'marketplace',
    fn: 'set_payment_asset',
    expected: { payment_asset: USDC }
  },
  {
    type: 'set-marketplace-secondary-fee',
    draft: { value: '2.5' },
    target: 'marketplace',
    fn: 'set_secondary_fee_bps',
    expected: { fee_bps: 250 }
  },
  { type: 'pause-marketplace', draft: {}, target: 'marketplace', fn: 'pause', expected: {} },
  { type: 'unpause-marketplace', draft: {}, target: 'marketplace', fn: 'unpause', expected: {} },
  {
    type: 'open-pool',
    draft: pool,
    target: 'marketplace',
    fn: 'open_pool',
    expected: {
      price: 15_000_000n,
      asset: XLM,
      expires_at: BigInt(Math.floor(new Date(pool.expiresAt).getTime() / 1000)),
      size: 10,
      max_per_buyer: 2,
      max_sold_per_period: 5,
      period_secs: 86_400n
    }
  },
  {
    type: 'close-pool',
    draft: { poolId: '3' },
    target: 'marketplace',
    fn: 'close_pool',
    expected: { pool_id: 3 }
  },
  {
    type: 'sweep-pool',
    draft: { poolId: '3' },
    target: 'marketplace',
    fn: 'sweep_pool',
    expected: { pool_id: 3 }
  },
  // Treasury purchases
  {
    type: 'treasury-authorize',
    draft: { nodes: authNodes },
    target: 'treasury',
    // `authorize` is Treasury.execute's self-call; its argument has check_authorization's shape.
    fn: 'check_authorization',
    expected: {
      nodes: [
        {
          contract: XLM,
          fn_name: 'transfer',
          args: [
            new Address(config.treasuryContractId).toScVal(),
            new Address(config.marketplaceContractId).toScVal(),
            nativeToScVal(5_000_000n, { type: 'i128' })
          ],
          sub: []
        }
      ]
    }
  },
  {
    type: 'treasury-buy-listing',
    draft: { tokenId: '11', maxPrice: '5000000' },
    target: 'marketplace',
    fn: 'buy',
    expected: { token_id: 11, buyer: config.treasuryContractId, max_price: 5_000_000n }
  },
  // Tribe identity and artwork
  {
    type: 'set-token-metadata',
    draft: { name: 'Night Owls', symbol: 'OWL' },
    target: 'token',
    fn: 'set_metadata',
    expected: { name: 'Night Owls', symbol: 'OWL' }
  },
  {
    type: 'change-dao-slug',
    draft: { slug: 'owl-house' },
    target: 'manager',
    fn: 'change_slug',
    expected: { token_address: config.tokenContractId, new_slug: 'owl-house' }
  },
  {
    type: 'update-dao-profile',
    draft: { expectedSeq: 2, profile },
    target: 'metadata',
    fn: 'update_profile',
    expected: { expected_seq: 2, profile }
  },
  {
    type: 'add-artwork-properties',
    draft: artwork,
    target: 'metadata',
    fn: 'add_properties',
    expected: { names: artwork.names, items: artwork.items, ipfs_group: artwork.ipfsGroup }
  },
  {
    type: 'set-artwork-renderer',
    draft: { value: 'https://render.example/owls' },
    target: 'metadata',
    fn: 'update_renderer_base',
    expected: { new_renderer_base: 'https://render.example/owls' }
  },
  {
    type: 'regenerate-token-traits',
    draft: { tokenId: '6' },
    target: 'metadata',
    fn: 'regenerate',
    expected: { token_id: 6 }
  },
  // Claims
  {
    type: 'open-claim-list',
    draft: claimList,
    target: 'claims',
    fn: 'open_list',
    expected: {
      root: Buffer.from(claimList.root, 'hex'),
      tree_uri: claimList.treeUri,
      asset: XLM,
      price: 10_000_000n,
      expires_at: BigInt(FUTURE),
      total: 12,
      assurance: null
    }
  },
  // Modules
  {
    type: 'create-module',
    draft: {
      kind: 'auction',
      moduleNumber: '2',
      address: NEW_MODULE,
      paymentAsset: XLM,
      reservePrice: '10000000',
      duration: '86400',
      timeBuffer: '300',
      feeBps: ''
    },
    // A tribe gets a new auction only when it has none.
    config: { auctionContractId: '' },
    target: 'manager',
    fn: 'create_module',
    expected: {
      token: config.tokenContractId,
      spec: {
        tag: 'Auction',
        values: [{ duration: 86_400n, reserve_price: 10_000_000n, time_buffer: 300n, payment_asset: XLM }]
      },
      expected_n: 2
    }
  },
  {
    type: 'register-module',
    draft: { kind: 'auction', address: NEW_MODULE, nonVoting: true },
    target: 'token',
    fn: 'register_module',
    expected: { kind: 'auction', address: NEW_MODULE, non_voting: true }
  },
  {
    type: 'unregister-module',
    draft: { kind: 'marketplace', address: config.marketplaceContractId },
    target: 'token',
    fn: 'unregister_module',
    expected: { address: config.marketplaceContractId }
  },
  {
    type: 'open-module',
    draft: { kind: 'auction', address: NEW_MODULE },
    encoding: { pendingModules: { [NEW_MODULE]: 'auction' } },
    target: 'newAuction',
    fn: 'unpause',
    expected: { caller: config.treasuryContractId }
  },
  // Contract upkeep
  {
    type: 'upgrade-dao-module',
    draft: { module: 'governor', fromHash: hash('01'), toHash: hash('0a') },
    target: 'governor',
    fn: 'upgrade',
    expected: { from_hash: Buffer.from(hash('01'), 'hex'), to_hash: Buffer.from(hash('0a'), 'hex') }
  },
  {
    type: 'migrate-dao-module',
    draft: { module: 'token' },
    target: 'token',
    fn: 'migrate',
    expected: {}
  }
];

const formContext = (fixture: Pick<Fixture, 'config'>): FormContext => ({
  config: { ...config, ...fixture.config },
  session: { address: alice, kit: null }
});
const encodingContext = (fixture: Pick<Fixture, 'encoding'>): ProposalEncodingContext => ({
  ...config,
  ...fixture.encoding
});
const specFor = (key: TargetKey): Spec | null => {
  const [contractId, Client] = TARGETS[key];
  return Client ? new Client({ contractId, rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase }).spec : null;
};
const xdrs = (args: xdr.ScVal[]) => args.map((arg) => arg.toXDR('base64'));

/** The bindings' encoding of the expected arguments; the SAC takes (from, to, i128). */
function expectedScVals(fixture: Fixture): xdr.ScVal[] {
  const spec = specFor(fixture.target);
  if (spec) return spec.funcArgsToScVals(fixture.fn, fixture.expected);
  const { from, to, amount } = fixture.expected as { from: string; to: string; amount: bigint };
  return [
    nativeToScVal(from, { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' })
  ];
}

/** A value as scValToNative reads it back: wide integers and bytes as text, unions as arrays. */
function readable(value: unknown): unknown {
  if (value instanceof xdr.ScVal) return readable(scValToNative(value as xdr.ScVal));
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) return value.map(readable);
  if (value && typeof value === 'object') {
    if ('tag' in value) {
      const union = value as { tag: string; values?: unknown[] };
      return [union.tag, ...(union.values ?? []).map(readable)];
    }
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, readable(inner)]));
  }
  return value;
}

/** The indexer's tagged form of an argument (`{ u32: 5 }`, `{ vec: [...] }`), as the detail page reads it. */
function indexed(value: xdr.ScVal): unknown {
  switch (value.type) {
    case 'scvVoid':
      return null;
    case 'scvBool':
    case 'scvU32':
    case 'scvI32':
    case 'scvString':
    case 'scvSymbol':
    case 'scvAddress':
      return { [value.type.slice(3).toLowerCase()]: scValToNative(value) };
    case 'scvU64':
    case 'scvI64':
    case 'scvU128':
    case 'scvI128':
      return { [value.type.slice(3).toLowerCase()]: String(scValToNative(value)) };
    case 'scvBytes':
      return { bytes: Buffer.from(scValToNative(value) as Uint8Array).toString('base64') };
    case 'scvVec':
      return { vec: (value.vec ?? []).map(indexed) };
    case 'scvMap':
      return { map: (value.map ?? []).map((entry) => ({ key: indexed(entry.key), val: indexed(entry.val) })) };
    default:
      throw new Error(`No indexed form for ${value.type}.`);
  }
}

/** The queued action as the store persists it, then the call vector and its XDR. */
function encodeQueued(fixture: Fixture) {
  const handler = getActionHandler(fixture.type);
  const action = JSON.parse(
    JSON.stringify(handler.serialize(fixture.draft, formContext(fixture)))
  ) as ProposalQueuedAction;
  const vectors = buildProposalCallVectors([action], config.tokenContractId, config.treasuryContractId, {
    ...config,
    ...fixture.config
  });
  return {
    action,
    vectors,
    encoded: encodeProposalCallArgs(vectors.targets, vectors.functions, vectors.args, encodingContext(fixture))
  };
}

const label = (fixture: Fixture) => fixture.name ?? fixture.type;

describe('every registered proposal action encodes to its contract function’s spec', () => {
  it('has a fixture for every registered action type', () => {
    const covered = new Set(FIXTURES.map((fixture) => fixture.type));
    const missing = getAllActionHandlers()
      .map((handler) => handler.type)
      .filter((type) => !covered.has(type));
    expect(missing, 'add a fixture to contract-spec.test.ts for each new action').toEqual([]);
  });

  it.each(FIXTURES.map((fixture) => [label(fixture), fixture] as const))('%s', (_name, fixture) => {
    const handler = getActionHandler(fixture.type);
    expect(handler.validate(fixture.draft, formContext(fixture))).toEqual({ valid: true });

    const { action, vectors, encoded } = encodeQueued(fixture);
    expect(action.type).toBe(fixture.type);

    // The call reaches the right contract, and that contract has the function.
    const [target] = TARGETS[fixture.target];
    expect(vectors.targets).toEqual([target]);
    const spec = specFor(fixture.target);
    const fn = fixture.type === 'treasury-authorize' ? 'authorize' : fixture.fn;
    expect(vectors.functions).toEqual([fn]);
    if (spec) expect(spec.funcs().map((entry) => entry.name.toString())).toContain(fixture.fn);

    // The XDR is the bindings' own encoding of the expected arguments, and reads back to them.
    const expected = expectedScVals(fixture);
    expect(xdrs(encoded[0]!)).toEqual(xdrs(expected));
    const names = spec
      ? spec.getFunc(fixture.fn).inputs.map((input) => input.name.toString())
      : ['from', 'to', 'amount'];
    expect(Object.fromEntries(encoded[0]!.map((arg, i) => [names[i], readable(arg)]))).toEqual(
      readable(fixture.expected)
    );

    // Re-encoding gives the same proposal id: from the queued action again, and from the indexer's
    // tagged form of the arguments (how the proposal page recomputes it).
    const description = keccak256Bytes(`contract-spec ${label(fixture)}`);
    const id = proposalCallId(vectors.targets, vectors.functions, encoded, description);
    expect(proposalCallId(vectors.targets, vectors.functions, encodeQueued(fixture).encoded, description)).toBe(id);
    const fromIndex = encodeProposalCallArgs(
      vectors.targets,
      vectors.functions,
      [encoded[0]!.map(indexed)],
      encodingContext(fixture)
    );
    expect(proposalCallId(vectors.targets, vectors.functions, fromIndex, description)).toBe(id);
  });
});

/**
 * The indexer's decoder (packages/goldsky decoded-events.script.js `native`) as the proposal API
 * serves it: no type tags, integers above 32 bits as strings, maps as objects. An authorize node's
 * `Vec<Val>` args lose their types here, which is what the encoder has to recover.
 */
function decoded(value: xdr.ScVal): unknown {
  switch (value.type) {
    case 'scvVoid':
      return null;
    case 'scvVec':
      return (value.vec ?? []).map(decoded);
    case 'scvMap':
      return Object.fromEntries((value.map ?? []).map((entry) => [String(decoded(entry.key)), decoded(entry.val)]));
    case 'scvBytes':
      return Buffer.from(scValToNative(value) as Uint8Array).toString('hex');
    case 'scvU64':
    case 'scvI64':
    case 'scvU128':
    case 'scvI128':
      return String(scValToNative(value));
    default:
      return scValToNative(value);
  }
}

describe('a treasury purchase re-encodes from the indexed proposal (AuthNode.args are Vec<Val>)', () => {
  const treasury = config.treasuryContractId;
  const seller = wallet(31);
  const authorizeFixture = FIXTURES.find((candidate) => candidate.type === 'treasury-authorize')!;
  const reencode = (nodes: unknown[]) => {
    const { encoded } = encodeQueued({ ...authorizeFixture, draft: { nodes } });
    const fromApi = encodeProposalCallArgs([treasury], ['authorize'], [encoded[0]!.map(decoded)], config);
    return { encoded: xdrs(encoded[0]!), fromApi: xdrs(fromApi[0]!) };
  };

  it('types each transfer from the asset contract’s transfer(from, to, i128)', () => {
    const { encoded, fromApi } = reencode(authNodes);
    expect(fromApi).toEqual(encoded);
  });

  it('rebuilds both transfers of a purchase with a fee, and the single transfer without one', () => {
    for (const fee of [125_000n, 0n]) {
      const nodes = treasuryPurchaseAuthNodes({ treasury, paymentAsset: XLM, seller, price: 5_000_000n, fee });
      expect(nodes).toHaveLength(fee ? 2 : 1);
      const { encoded, fromApi } = reencode(nodes);
      expect(fromApi).toEqual(encoded);
    }
  });

  it('types a node calling one of the DAO’s contracts from that contract’s spec (token.transfer takes a u32)', () => {
    const nodes = [
      {
        contract: config.tokenContractId,
        fnName: 'transfer',
        args: [
          { type: 'address', value: treasury },
          { type: 'address', value: seller },
          { type: 'u32', value: '7' }
        ],
        sub: []
      }
    ];
    const { encoded, fromApi } = reencode(nodes);
    expect(fromApi).toEqual(encoded);
  });

  it('refuses an untyped node whose callee has no known signature', () => {
    const unknown = contract(42);
    const indexedNode = { args: [treasury, '5'], contract: unknown, fn_name: 'pay', sub: [] };
    expect(() => encodeProposalCallArgs([treasury], ['authorize'], [[[indexedNode]]], config)).toThrow(
      /Untyped authorization arguments/
    );
  });
});

describe('validators refuse what each contract rejects', () => {
  const U32_OVER = '4294967296';
  const cases: Array<[ProposalActionType, Record<string, unknown>, string, Partial<DaoNetworkConfig>?]> = [
    // Governor: timings 300..=2_592_000 s, quorum 1..=10_000 bps, threshold at least 1.
    ['set-voting-delay', { value: '299' }, 'below the 5 minute floor'],
    ['set-voting-period', { value: '2592001' }, 'above the 30 day cap'],
    ['set-queue-delay', { value: '299' }, 'below the 5 minute floor'],
    ['set-quorum-bps', { value: '0' }, 'zero quorum'],
    ['set-quorum-bps', { value: '10001' }, 'over 100%'],
    ['set-proposal-threshold', { value: '0' }, 'zero threshold'],
    // Auction: duration 300..=2_592_000 s, time buffer 1..=86_400 s, increment 1..=100%, reserve ≥ 1000 stroops.
    ['set-auction-duration', { value: '299' }, 'below the 5 minute floor'],
    ['set-auction-duration', { value: '2592001' }, 'above the 30 day cap'],
    ['set-auction-time-buffer', { value: '0' }, 'no extension'],
    ['set-auction-time-buffer', { value: '86401' }, 'over a day'],
    ['set-auction-min-bid-increment', { value: '0' }, 'zero increment'],
    ['set-auction-min-bid-increment', { value: '101' }, 'over 100%'],
    ['set-auction-reserve-price', { reservePrice: '0.00009' }, 'below the minimum reserve'],
    ['set-auction-reserve-price', { reservePrice: '1.12345678' }, 'more than seven decimals'],
    // Market: fee 0..=2_500 bps, payment asset XLM or USDC, pool counts within u32 and above zero.
    ['set-marketplace-secondary-fee', { value: '25.01' }, 'over the 25% cap'],
    ['set-marketplace-payment-token', { paymentToken: contract(30) }, 'an asset buyers cannot pay in'],
    ['open-pool', { ...pool, size: '0' }, 'an empty pool'],
    ['open-pool', { ...pool, maxPerBuyer: U32_OVER }, 'a per-wallet limit over u32'],
    ['open-pool', { ...pool, expiresAt: '2000-01-01T00:00' }, 'a closing time in the past'],
    ['close-pool', { poolId: 'x' }, 'a pool that is not a number'],
    // Token: allowance in u32 above zero, batch within the event budget, token ids in u32, safe names.
    ['change-mint-allowance', { module: config.marketplaceContractId, amount: '0', direction: 'increase' }, 'zero'],
    [
      'change-mint-allowance',
      { module: config.marketplaceContractId, amount: U32_OVER, direction: 'increase' },
      'over u32'
    ],
    ['change-mint-allowance', { module: alice, amount: '1', direction: 'increase' }, 'a wallet, not a module'],
    ['batch-mint-governance-token', { recipient: alice, amount: String(MAX_BATCH_MINT + 1) }, 'over the batch cap'],
    ['mint-governance-token', { recipient: alice, amount: '2' }, 'more than one'],
    ['dao-transfer', { tokenId: U32_OVER, to: bob }, 'a token id over u32'],
    ['approved-transfer', { tokenId: '1', from: 'nobody', to: bob }, 'a bad holder'],
    ['set-transfer-agent', { module: alice, enabled: true }, 'a wallet, not a module'],
    ['set-token-metadata', { name: 'Owls "R" Us', symbol: 'OWL' }, 'quotes in the name (InvalidName)'],
    ['set-token-metadata', { name: 'Night Owls', symbol: 'owl!' }, 'a bad symbol'],
    ['transfer-dao-token', { tokenId: '-1', recipient: alice }, 'a negative token id'],
    // Metadata: 16 properties, 30 items, ids 0..=15, strings ≤ 256 bytes, profile ≤ 4096 bytes.
    ['add-artwork-properties', { ...artwork, names: Array.from({ length: 17 }, (_, i) => `p${i}`) }, '17 names'],
    [
      'add-artwork-properties',
      { ...artwork, items: [{ name: 'Round', is_new_property: false, property_id: 16 }], names: [] },
      'a property id over 15'
    ],
    ['set-artwork-renderer', { value: `https://render.example/${'a'.repeat(240)}` }, 'over 256 bytes'],
    ['update-dao-profile', { expectedSeq: 1, profile: JSON.stringify({ description: 'a'.repeat(4100) }) }, 'over 4096'],
    ['update-dao-profile', { expectedSeq: -1, profile }, 'an unknown revision'],
    ['regenerate-token-traits', { tokenId: 'six' }, 'a token id that is not a number'],
    // ClaimMinter: ipfs:// tree under 256 bytes, a future close, at least one token.
    ['open-claim-list', { ...claimList, treeUri: 'https://bafyclaims' }, 'a tree that is not on IPFS'],
    ['open-claim-list', { ...claimList, expiresAt: 1 }, 'a list that already closed'],
    ['open-claim-list', { ...claimList, total: 0 }, 'an empty list'],
    // Manager: slugs of 4..=63 lowercase letters, numbers and single hyphens; one module per kind.
    ['change-dao-slug', { slug: 'owl' }, 'too short'],
    ['change-dao-slug', { slug: 'night-owls' }, 'the current link'],
    [
      'create-module',
      {
        kind: 'auction',
        moduleNumber: '2',
        address: NEW_MODULE,
        paymentAsset: XLM,
        reservePrice: '1000',
        duration: '299',
        timeBuffer: '300',
        feeBps: ''
      },
      'an auction shorter than 5 minutes',
      { auctionContractId: '' }
    ],
    [
      'create-module',
      {
        kind: 'auction',
        moduleNumber: '2',
        address: NEW_MODULE,
        paymentAsset: XLM,
        reservePrice: '10000000',
        duration: '86400',
        timeBuffer: '300',
        feeBps: ''
      },
      'a second auction'
    ],
    ['upgrade-dao-module', { module: 'token', fromHash: hash('01'), toHash: hash('01') }, 'the same hash'],
    ['transfer-sac-token', { recipient: alice, amount: '0.00000001', assetCode: 'XLM' }, 'eight decimals']
  ];

  it.each(cases.map(([type, draft, why, change]) => [`${type}: ${why}`, type, draft, change] as const))(
    '%s',
    (_name, type, draft, change) => {
      expect(getActionHandler(type).validate(draft, formContext({ config: change })).valid).toBe(false);
    }
  );
});
