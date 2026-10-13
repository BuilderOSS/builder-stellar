import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';

import { packedProposal } from '@/lib/chain-reads/proposal-core';
import { namespacedKey } from '@/lib/storage-key';

import {
  buildDaoInventory,
  codeHealthStatus,
  effectiveUpgradeDelay,
  extendToLedgers,
  instanceKey,
  instanceWasmHash,
  type LedgerEntryInfo,
  type LedgerRead,
  type ModuleRenewalRead,
  parseRenewalPage,
  planBatches,
  proposalIsLive,
  summarizeInventory,
  yearlyRentEstimate
} from './renewal';

const contract = () => Address.contract(Keypair.random().rawPublicKey()).toString();
const [MANAGER, TOKEN, METADATA, TREASURY, AUCTION, MARKET, GOVERNOR, CLAIMS, ASSET, POOL_ASSET, OUTSIDE] = Array.from(
  { length: 11 },
  contract
);
const MEMBER = Keypair.random().publicKey();
const NOW = 2_000_000_000;

const data = (owner: string, key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(owner).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent
    })
  );
const entryData = (owner: string, key: xdr.ScVal, val: xdr.ScVal) =>
  xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: xdr.ExtensionPoint.v0(),
      contract: new Address(owner).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
      val
    })
  );
const ns = (variant: string, ...args: xdr.ScVal[]) => namespacedKey(variant, ...args);
const oz = (variant: string, ...args: xdr.ScVal[]) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...args]);
const u32 = (n: number) => xdr.ScVal.scvU32(n);
const addr = (a: string) => new Address(a).toScVal();
const instance = (storage: Array<[xdr.ScVal, xdr.ScVal]>) =>
  xdr.ScVal.scvContractInstance(
    new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
      storage: storage.map(([key, val]) => new xdr.ScMapEntry({ key, val }))
    })
  );
const id = (n: number) => xdr.ScVal.scvBytes(Buffer.alloc(32, n));
const core = (seq: number, state: number, voteEnd: number, eta = 0) =>
  packedProposal({
    proposer: Keypair.random().publicKey(),
    voteSnapshot: 1,
    voteStart: 1,
    voteEnd,
    eta,
    state,
    seq,
    quorum: 1n
  });

const moduleEntry = (kind: string, address: string, nonVoting: boolean) =>
  nativeToScVal(
    { address, kind, non_voting: nonVoting },
    { type: { address: ['symbol', 'address'], kind: ['symbol', 'symbol'], non_voting: ['symbol', 'bool'] } }
  ) as xdr.ScVal;

/**
 * Each module's renewal_keys pages: the Marketplace lists a listing slot and one pool over two
 * pages, the ClaimMinter one list, the Auction nothing but the asset it holds. An outside
 * module has no renewal_keys.
 */
const renewalKeys: ModuleRenewalRead = async (module, cursor) => {
  if (module === MARKET)
    return cursor === 0
      ? {
          keys: [ns('Listing', u32(5)), ns('Listing', u32(6))].map((key) => ({ key, persistent: true })),
          assets: [],
          nextCursor: 2
        }
      : {
          keys: [ns('Pool', u32(1)), ns('PoolStock', u32(1), u32(0))].map((key) => ({ key, persistent: true })),
          assets: [],
          nextCursor: null
        };
  if (module === CLAIMS)
    return { keys: [{ key: ns('List', u32(0)), persistent: true }], assets: [ASSET], nextCursor: null };
  if (module === AUCTION) return { keys: [], assets: [ASSET, TOKEN], nextCursor: null };
  return null;
};

/** A ledger with one launched DAO: 2 properties (40 + 3 items), 70 minted tokens, 3 proposals. */
function ledger(omit: string[] = [], withOutside = false) {
  const entries = new Map<string, LedgerEntryInfo>();
  const put = (owner: string, key: xdr.ScVal, val: xdr.ScVal, label: string) => {
    if (omit.includes(label)) return;
    entries.set(data(owner, key).toXDR('base64'), {
      liveUntil: 1_000 + entries.size,
      bytes: 100,
      val: entryData(owner, key, val)
    });
  };
  const inst = xdr.ScVal.scvLedgerKeyContractInstance();
  put(
    TOKEN,
    inst,
    instance([
      [ns('MetadataContract'), addr(METADATA)],
      [ns('Treasury'), addr(TREASURY)],
      [
        ns('Modules'),
        xdr.ScVal.scvVec([
          moduleEntry('auction', AUCTION, true),
          moduleEntry('marketplace', MARKET, true),
          moduleEntry('claims', CLAIMS, false),
          ...(withOutside ? [moduleEntry('custom_vault', OUTSIDE, false)] : [])
        ])
      ],
      [oz('TokenIdCounter'), u32(70)],
      [oz('NumTotalSupplyCheckpoints'), u32(2)]
    ]),
    'token'
  );
  put(
    METADATA,
    inst,
    instance([[ns('ItemCounts'), nativeToScVal([40, 3], { type: ['u32'] }) as xdr.ScVal]]),
    'metadata'
  );
  put(TREASURY, inst, instance([[ns('Governor'), addr(GOVERNOR)]]), 'treasury');
  const config = (field: string) =>
    nativeToScVal({ [field]: ASSET }, { type: { [field]: ['symbol', 'address'] } }) as xdr.ScVal;
  put(AUCTION, inst, instance([[ns('Config'), config('payment_token')]]), 'auction');
  put(MARKET, inst, instance([[ns('Config'), config('payment_asset')]]), 'market');
  put(CLAIMS, inst, instance([]), 'claims');
  put(OUTSIDE, inst, instance([]), 'outside');
  put(
    GOVERNOR,
    inst,
    instance([
      [ns('ProposalCount'), u32(3)],
      [oz('NumQuorumCheckpoints'), u32(1)]
    ]),
    'governor'
  );
  put(METADATA, ns('PropertyNames'), xdr.ScVal.scvVoid(), 'names');
  for (const [i, pages] of [
    [0, 2],
    [1, 1]
  ] as const) {
    for (let page = 0; page < pages; page += 1)
      put(METADATA, ns('Items', u32(i), u32(page)), xdr.ScVal.scvVoid(), `items${i}.${page}`);
  }
  put(METADATA, ns('IpfsGroups'), xdr.ScVal.scvVoid(), 'groups');
  put(METADATA, ns('AttributesPage', u32(0)), xdr.ScVal.scvVoid(), 'attrs0');
  put(METADATA, ns('AttributesPage', u32(1)), xdr.ScVal.scvVoid(), 'attrs1');
  for (const i of [0, 1]) put(TOKEN, oz('TotalSupplyCheckpoint', u32(i)), xdr.ScVal.scvVoid(), `supply${i}`);
  for (const holder of [AUCTION, CLAIMS]) put(TOKEN, ns('MintAllowance', addr(holder)), u32(10), 'allowance');
  put(MARKET, ns('Listing', u32(5)), xdr.ScVal.scvVoid(), 'listing5');
  // The pool is priced in an asset the Marketplace no longer uses for new sales.
  put(
    MARKET,
    ns('Pool', u32(1)),
    nativeToScVal({ asset: POOL_ASSET }, { type: { asset: ['symbol', 'address'] } }) as xdr.ScVal,
    'pool1'
  );
  put(MARKET, ns('PoolStock', u32(1), u32(0)), xdr.ScVal.scvVoid(), 'stock1');
  put(CLAIMS, ns('List', u32(0)), xdr.ScVal.scvVoid(), 'list0');
  put(MANAGER, ns('DaoSlug', addr(TOKEN)), xdr.ScVal.scvString('lantern-club'), 'daoslug');
  put(MANAGER, ns('SlugToDao', xdr.ScVal.scvString('lantern-club')), addr(TOKEN), 'slugtodao');
  put(MANAGER, ns('ModuleCount', addr(TOKEN), xdr.ScVal.scvSymbol('auction')), u32(1), 'count');
  // Holdings: token 3 sits in the treasury and 69 in the auction; the rest are members'.
  for (let t = 0; t < 70; t += 1)
    put(TOKEN, oz('Owner', u32(t)), addr(t === 3 ? TREASURY : t === 69 ? AUCTION : MEMBER), `owner${t}`);
  put(TOKEN, oz('Balance', addr(TREASURY)), u32(1), 'treasuryTokens');
  put(TOKEN, oz('Balance', addr(MEMBER)), u32(68), 'memberTokens');
  put(ASSET, oz('Balance', addr(TREASURY)), xdr.ScVal.scvVoid(), 'treasuryFunds');
  put(ASSET, oz('Balance', addr(AUCTION)), xdr.ScVal.scvVoid(), 'auctionFunds');
  put(POOL_ASSET, oz('Balance', addr(MARKET)), xdr.ScVal.scvVoid(), 'poolFunds');
  // Proposal 0 executed, 1 queued and live, 2 pending and live (with a tally).
  [
    [7, NOW - 10],
    [5, NOW - 10, NOW],
    [0, NOW + 100]
  ].forEach(([state, voteEnd, eta], seq) => {
    put(GOVERNOR, ns('ProposalId', u32(seq)), id(seq), `id${seq}`);
    put(GOVERNOR, ns('ProposalTime', id(seq)), core(seq, state!, voteEnd!, eta), `core${seq}`);
  });
  put(GOVERNOR, oz('ProposalVote', id(2)), xdr.ScVal.scvVoid(), 'vote2');
  put(GOVERNOR, oz('QuorumCheckpoint', u32(0)), xdr.ScVal.scvVoid(), 'quorum0');
  const read: LedgerRead = async (keys) => ({
    latestLedger: 900,
    entries: new Map(
      keys.flatMap((k) =>
        entries.has(k.toXDR('base64')) ? [[k.toXDR('base64'), entries.get(k.toXDR('base64'))!]] : []
      )
    )
  });
  return read;
}

const labels = (keys: Array<{ label: string }>) => keys.map((k) => k.label).sort();

describe('DAO renewal inventory', () => {
  it('lists every DAO-owned key: core reads plus each module’s own pages, live proposals only', async () => {
    const inventory = await buildDaoInventory(ledger(), {
      manager: MANAGER,
      token: TOKEN,
      nowSeconds: NOW,
      renewalKeys
    });
    expect(inventory.missing).toEqual([]);
    expect(inventory.uncovered).toEqual([]);
    expect(labels(inventory.present)).toEqual(
      [
        'Token',
        'Metadata',
        'Treasury',
        'Auction',
        'Marketplace',
        'Claims',
        'Governor',
        'PropertyNames',
        'Items(0, 0)',
        'Items(0, 1)',
        'Items(1, 0)',
        'IpfsGroups',
        'AttributesPage(0)',
        'AttributesPage(1)',
        'TotalSupplyCheckpoint(1)',
        'Token #3',
        'Token #69',
        'Token balance',
        'Asset balance',
        'Asset balance',
        'Asset balance',
        'MintAllowance',
        'MintAllowance',
        'Listing(5)',
        'Pool(1)',
        'PoolStock(1, 0)',
        'List(0)',
        'DaoSlug',
        'SlugToDao',
        'ModuleCount(auction)',
        'ProposalId(1)',
        'ProposalTime(1)',
        'ProposalId(2)',
        'ProposalTime(2)',
        'ProposalVote(2)',
        'QuorumCheckpoint(0)'
      ].sort()
    );
    const classes = summarizeInventory(inventory).map((summary) => [summary.cls, summary.keys]);
    expect(classes).toEqual([
      ['contracts', 7],
      ['artwork', 7],
      ['tokens', 3],
      ['proposals', 6],
      ['listings', 3],
      ['holdings', 6],
      ['slug', 3],
      ['claims', 1]
    ]);
  });

  it('renews an outside module’s instance and reports its records as not covered', async () => {
    const inventory = await buildDaoInventory(ledger([], true), {
      manager: MANAGER,
      token: TOKEN,
      nowSeconds: NOW,
      renewalKeys
    });
    expect(inventory.uncovered).toEqual([OUTSIDE]);
    expect(labels(inventory.present)).toContain('Vault');
  });

  it('decodes a RenewalPage, keeping keys as raw XDR', () => {
    const key = ns('Pool', u32(1));
    const page = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('assets'), val: xdr.ScVal.scvVec([addr(ASSET)]) }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('keys'),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvVec([key, xdr.ScVal.scvBool(true)])])
      }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('next_cursor'), val: u32(200) })
    ]);
    const parsed = parseRenewalPage(page);
    expect(parsed.assets).toEqual([ASSET]);
    expect(parsed.nextCursor).toBe(200);
    expect(parsed.keys[0]!.key.toXDR('base64')).toBe(key.toXDR('base64'));
    expect(parsed.keys[0]!.persistent).toBe(true);
    const last = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('assets'), val: xdr.ScVal.scvVec([]) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('keys'), val: xdr.ScVal.scvVec([]) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('next_cursor'), val: xdr.ScVal.scvVoid() })
    ]);
    expect(parseRenewalPage(last).nextCursor).toBeNull();
  });

  it('reports a required key the ledger does not return, and ignores absent optional ones', async () => {
    const inventory = await buildDaoInventory(ledger(['items0.1', 'listing5']), {
      manager: MANAGER,
      token: TOKEN,
      nowSeconds: NOW,
      renewalKeys
    });
    expect(labels(inventory.missing)).toEqual(['Items(0, 1)']);
    expect(labels(inventory.present)).not.toContain('Listing(5)');
  });

  it('restores entries the RPC returns with a live-until already past', async () => {
    const base = ledger();
    // The RPC reports the DAO's asset balances as archived.
    const read: LedgerRead = async (keys) => {
      const result = await base(keys);
      for (const [id, info] of result.entries) {
        const key = xdr.LedgerKey.fromXDR(id, 'base64');
        const owner = key.type === 'contractData' ? Address.fromScAddress(key.contractData.contract).toString() : '';
        if (owner === ASSET) result.entries.set(id, { ...info, liveUntil: 899 });
      }
      return result;
    };
    const inventory = await buildDaoInventory(read, { manager: MANAGER, token: TOKEN, nowSeconds: NOW });
    expect(labels(inventory.missing)).toEqual(['Asset balance', 'Asset balance']);
    expect(labels(inventory.present)).not.toContain('Asset balance');
  });

  it('keeps history checkpoints and members’ tokens out of the sweep', async () => {
    const inventory = await buildDaoInventory(ledger(), { manager: MANAGER, token: TOKEN, nowSeconds: NOW });
    const all = labels([...inventory.present, ...inventory.missing]);
    expect(all).not.toContain('TotalSupplyCheckpoint(0)');
    expect(all.filter((l) => l.startsWith('Token #'))).toEqual(['Token #3', 'Token #69']);
  });

  it('estimates a year of rent from the quote’s rate', () => {
    const present = [
      { bytes: 1_000, liveUntil: 10_000 },
      { bytes: 3_000, liveUntil: 10_000 + 17_280 * 100 }
    ] as unknown as Parameters<typeof yearlyRentEstimate>[0]['present'];
    const inventory = { present, latestLedger: 10_000 };
    const extendTo = 17_280 * 180;
    // 1,000 B gain 180 days and 3,000 B gain 80: 420,000 byte-days for 4.2 XLM, 0.00001 XLM per byte-day.
    const fee = 42_000_000n;
    expect(yearlyRentEstimate(inventory, extendTo, fee)).toBe((fee * 4_000n * 365n) / 420_000n);
    expect(yearlyRentEstimate(inventory, 0, fee)).toBeNull();
  });

  it('fails loudly when the token instance itself is gone', async () => {
    await expect(
      buildDaoInventory(ledger(['token']), { manager: MANAGER, token: TOKEN, nowSeconds: NOW })
    ).rejects.toThrow('archived');
  });

  it('treats a proposal as over once it cannot change state', () => {
    expect(proposalIsLive({ state: 7, vote_end: NOW, eta: 0 }, NOW)).toBe(false);
    expect(proposalIsLive({ state: 5, vote_end: 0, eta: NOW - 1_209_600 }, NOW)).toBe(false);
    expect(proposalIsLive({ state: 5, vote_end: 0, eta: NOW - 1_209_599 }, NOW)).toBe(true);
    expect(proposalIsLive({ state: 0, vote_end: NOW - 1_209_599, eta: 0 }, NOW)).toBe(true);
  });

  it('keeps one transaction for a reference DAO and splits only past the limits', () => {
    expect(planBatches(Array.from({ length: 75 }, () => ({ bytes: 1_600 })))).toHaveLength(1);
    expect(planBatches(Array.from({ length: 500 }, () => ({ bytes: 100 })))).toHaveLength(2);
    expect(planBatches(Array.from({ length: 10 }, () => ({ bytes: 30_000 })))).toHaveLength(2);
  });

  it('caps the extension one ledger under the network maximum', () => {
    expect(extendToLedgers(30, 3_110_400)).toBe(518_400);
    expect(extendToLedgers(365, 3_110_400)).toBe(3_110_399);
  });

  it('uses the instance key of each contract', () => {
    expect(instanceKey(TOKEN).toXDR('base64')).toBe(
      data(TOKEN, xdr.ScVal.scvLedgerKeyContractInstance()).toXDR('base64')
    );
  });
});

describe('instanceWasmHash', () => {
  it('reads the hash bytes out of the XDR Hash wrapper', () => {
    const instance = xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32, 5)),
        storage: null
      })
    );
    expect(instanceWasmHash(instance)).toBe('05'.repeat(32));
    expect(
      instanceWasmHash(
        xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({
            executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
            storage: null
          })
        )
      )
    ).toBeNull();
    expect(instanceWasmHash(xdr.ScVal.scvU32(1))).toBeNull();
  });
});

describe('codeHealthStatus', () => {
  it('uses platform lead times, not the member thresholds', () => {
    const day = 17_280;
    expect(codeHealthStatus(null, 1_000)).toBe('unknown');
    expect(codeHealthStatus(1_000 + 61 * day, 1_000)).toBe('healthy');
    expect(codeHealthStatus(1_000 + 60 * day, 1_000)).toBe('soon');
    expect(codeHealthStatus(1_000 + 14 * day, 1_000)).toBe('critical');
    expect(codeHealthStatus(999, 1_000)).toBe('expired');
  });
});

describe('effectiveUpgradeDelay', () => {
  const info = (storage: Array<[xdr.ScVal, xdr.ScVal]>) =>
    ({
      liveUntil: 1,
      bytes: 1,
      val: entryData(TOKEN, xdr.ScVal.scvLedgerKeyContractInstance(), instance(storage))
    }) as const;
  const pending = (ledgers: number, effective: number) =>
    nativeToScVal(
      { ledgers, effective_ledger: effective },
      { type: { ledgers: ['symbol', 'u32'], effective_ledger: ['symbol', 'u32'] } }
    ) as xdr.ScVal;
  it('mirrors common::upgrade::delay', () => {
    expect(effectiveUpgradeDelay(undefined, 100)).toBe(7 * 17_280);
    expect(effectiveUpgradeDelay(info([[ns('UpgradeDelay'), u32(720)]]), 100)).toBe(720);
    const reducing = info([
      [ns('UpgradeDelay'), u32(720)],
      [ns('PendingUpgradeDelay'), pending(60, 1_000)]
    ]);
    expect(effectiveUpgradeDelay(reducing, 999)).toBe(720);
    expect(effectiveUpgradeDelay(reducing, 1_000)).toBe(60);
  });
});
