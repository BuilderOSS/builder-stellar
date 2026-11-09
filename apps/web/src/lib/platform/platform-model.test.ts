import { xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import type { DaoInventory, InventoryKey, LedgerEntryInfo } from '@/lib/chain-reads/renewal';
import { attentionItems } from '@/lib/platform/attention';
import type { IndexedImplementation } from '@/lib/platform/indexed';
import {
  assembleImplementations,
  groupImplementations,
  isPlatformAdmin,
  type RegistryImplementation
} from '@/lib/platform/registry';
import { buildPlatformInventory, platformHashes, platformKeys, summarizePlatform } from '@/lib/platform/storage';
import { eachLimited, needsRenewal, sortTribeRows, summarizeTribe, type TribeRow } from '@/lib/platform/tribes';
import { LEDGERS_PER_DAY } from '@/lib/ttl-expiry';

const MANAGER = 'CCLBJAC5DM66J3TFQVZOZ3F4Q3TV4CZKBT5ZADRTE7BZPF3QAIEK72ZD';
const ADMIN = `G${'A'.repeat(55)}`;
const h = (c: string) => c.repeat(64);

const indexed = (
  name: string,
  version: string,
  hash: string,
  extra: Partial<IndexedImplementation> = {}
): IndexedImplementation => ({
  name,
  version,
  hash,
  publishedLedger: 100,
  revoked: false,
  usedBy: 0,
  ...extra
});

describe('registry', () => {
  it('marks latest, current and running hashes, and prefers the live revoked state', () => {
    const rows = assembleImplementations({
      indexed: [
        indexed('Token', '0.4.0', h('a'), { usedBy: 3 }),
        indexed('Token', '0.3.0', h('b')),
        indexed('Manager', '0.4.0', h('c'))
      ],
      records: new Map([
        [h('a'), { name: 'Token', version: '0.4.0', revoked: false, publishedLedger: 100 }],
        [h('b'), { name: 'Token', version: '0.3.0', revoked: true, publishedLedger: 90 }],
        [h('c'), null]
      ]),
      latest: { Token: h('a'), Manager: h('c') },
      current: { token: h('a') },
      managerHash: h('c')
    });
    const byHash = Object.fromEntries(rows.map((r) => [r.hash, r]));
    expect(byHash[h('a')]).toMatchObject({ latest: true, current: 'token', running: false, usedBy: 3 });
    expect(byHash[h('b')]).toMatchObject({ latest: false, current: null, revoked: true });
    // The chain could not be read for this one: the indexed value stands.
    expect(byHash[h('c')]).toMatchObject({ running: true, revoked: false });
  });

  it('adds a hash the chain points at that the index has not seen yet', () => {
    const rows = assembleImplementations({
      indexed: [],
      records: new Map([[h('d'), { name: 'Governor', version: '0.5.0', revoked: false, publishedLedger: 200 }]]),
      latest: { Governor: h('d') },
      current: null,
      managerHash: null
    });
    expect(rows).toEqual([
      expect.objectContaining({ name: 'Governor', version: '0.5.0', hash: h('d'), latest: true, usedBy: 0 })
    ]);
  });

  it('groups by registry name in page order, newest first, and keeps unknown names', () => {
    const row = (name: string, ledger: number): RegistryImplementation => ({
      name,
      version: String(ledger),
      hash: `${name}${ledger}`,
      publishedLedger: ledger,
      revoked: false,
      usedBy: 0,
      latest: false,
      current: null,
      running: false
    });
    const groups = groupImplementations([row('Token', 1), row('Manager', 5), row('Token', 9), row('Custom', 3)]);
    expect(groups.map((g) => g.name)).toEqual(['Manager', 'Token', 'Custom']);
    expect(groups[1]!.rows.map((r) => r.publishedLedger)).toEqual([9, 1]);
  });

  it('gives actions only to the signed-in live admin', () => {
    expect(isPlatformAdmin({ authStatus: 'authenticated', address: ADMIN }, ADMIN)).toBe(true);
    expect(isPlatformAdmin({ authStatus: 'anonymous', address: ADMIN }, ADMIN)).toBe(false);
    expect(isPlatformAdmin({ authStatus: 'authenticated', address: `G${'B'.repeat(55)}` }, ADMIN)).toBe(false);
    expect(isPlatformAdmin({ authStatus: 'authenticated', address: ADMIN }, null)).toBe(false);
  });
});

describe('platform storage', () => {
  const state = {
    managerHash: h('1'),
    current: { token: h('2'), metadata: h('2') },
    latest: { Manager: h('1'), Token: h('3') },
    runningHashes: [h('4'), h('2'), 'not-a-hash']
  };

  it('collects every hash in use or about to be, once, like renew-code-ttl.mjs', () => {
    expect([...platformHashes(state).keys()]).toEqual([h('1'), h('2'), h('3'), h('4')]);
  });

  it('keeps the Manager instance, code and record per hash, and a pointer per announced name', () => {
    const keys = platformKeys(MANAGER, state);
    const count = (cls: string) => keys.filter((k) => k.cls === cls).length;
    expect([count('manager'), count('code'), count('records'), count('pointers')]).toEqual([1, 4, 4, 2]);
  });

  it('routes missing and already-expired keys to restore', async () => {
    const keys = platformKeys(MANAGER, { managerHash: h('1'), current: null, latest: {}, runningHashes: [] });
    const entries = new Map<string, LedgerEntryInfo>();
    const val = {} as xdr.LedgerEntryData;
    entries.set(keys[0]!.key.toXDR('base64'), { liveUntil: 2000, bytes: 100, val });
    entries.set(keys[1]!.key.toXDR('base64'), { liveUntil: 999, bytes: 100, val });
    const inventory = await buildPlatformInventory(async () => ({ latestLedger: 1000, entries }), keys);
    expect(inventory.present.map((k) => k.cls)).toEqual(['manager']);
    expect(inventory.missing.map((k) => k.cls)).toEqual(['code', 'records']);
    const summary = Object.fromEntries(summarizePlatform(inventory).map((s) => [s.cls, s.status]));
    expect(summary).toEqual({ code: 'expired', records: 'expired', manager: 'critical' });
  });

  it('uses the platform thresholds: renew soon under 60 days', async () => {
    const keys = platformKeys(MANAGER, { managerHash: null, current: null, latest: {}, runningHashes: [] });
    const entries = new Map([
      [
        keys[0]!.key.toXDR('base64'),
        { liveUntil: 1000 + 50 * LEDGERS_PER_DAY, bytes: 1, val: {} as xdr.LedgerEntryData }
      ]
    ]);
    const inventory = await buildPlatformInventory(async () => ({ latestLedger: 1000, entries }), keys);
    expect(summarizePlatform(inventory)[0]).toMatchObject({ cls: 'manager', status: 'soon' });
  });
});

describe('tribe health', () => {
  const key = (cls: InventoryKey['cls']) => ({ cls, label: cls, key: {} as xdr.LedgerKey, required: true });
  const inventory = (
    present: Array<[InventoryKey['cls'], number]>,
    missing: Array<InventoryKey['cls']> = []
  ): DaoInventory => ({
    latestLedger: 1000,
    present: present.map(([cls, liveUntil]) => ({ ...key(cls), liveUntil, bytes: 10, val: {} as xdr.LedgerEntryData })),
    missing: missing.map(key),
    uncovered: []
  });

  it('rates a tribe by its worst class and dates the earliest', () => {
    const health = summarizeTribe({
      inventory: inventory([
        ['contracts', 1000 + 100 * LEDGERS_PER_DAY],
        ['proposals', 1000 + 10 * LEDGERS_PER_DAY]
      ])
    });
    expect(health).toMatchObject({ status: 'critical', earliestClass: 'proposals', missing: 0 });
  });

  it('calls a tribe with archived items expired', () => {
    expect(
      summarizeTribe({ inventory: inventory([['contracts', 1000 + 100 * LEDGERS_PER_DAY]], ['artwork']) }).status
    ).toBe('expired');
    expect(summarizeTribe({ inventory: { ...inventory([]), bootstrap: true } })).toMatchObject({
      status: 'expired',
      bootstrap: true
    });
  });

  const tribe = (name: string) => ({
    daoId: name,
    name,
    slug: null,
    status: 'operational' as const,
    contracts: { token: '', metadata: '', governor: '', treasury: '', auction: '', marketplace: '', claims: '' }
  });
  const ready = (name: string, status: 'healthy' | 'soon' | 'critical' | 'expired', at: number): TribeRow => ({
    tribe: tribe(name),
    state: 'ready',
    health: { status, earliestClass: 'contracts', earliestLiveUntil: at, latestLedger: 0, missing: 0, bootstrap: false }
  });

  it('sorts worst first, then soonest, with unread rows among the urgent ones', () => {
    const rows: TribeRow[] = [
      ready('healthy', 'healthy', 1),
      ready('soon-late', 'soon', 900),
      { tribe: tribe('loading'), state: 'loading' },
      ready('soon-early', 'soon', 100),
      { tribe: tribe('error'), state: 'error', error: 'boom' },
      ready('expired', 'expired', 5)
    ];
    expect(sortTribeRows(rows).map((r) => r.tribe.name)).toEqual([
      'expired',
      'error',
      'soon-early',
      'soon-late',
      'loading',
      'healthy'
    ]);
    expect(rows.filter(needsRenewal).map((r) => r.tribe.name)).toEqual(['soon-late', 'soon-early', 'error', 'expired']);
  });

  it('never runs more checks at once than the limit', async () => {
    let live = 0;
    let peak = 0;
    await eachLimited([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 1));
      live -= 1;
    });
    expect(peak).toBe(3);
  });
});

describe('attention', () => {
  it('is empty when everything is healthy, so the section is not shown', () => {
    expect(
      attentionItems({
        state: { factoryPaused: false, pendingAdmin: null, errors: [] },
        storage: [],
        tribes: [],
        pendingManagerUpgrade: null
      })
    ).toEqual([]);
  });

  it('lists urgent items before warnings', () => {
    const items = attentionItems({
      state: { factoryPaused: true, pendingAdmin: ADMIN, errors: [] },
      storage: [{ cls: 'code', keys: 3, missing: [], earliestLiveUntil: 1, status: 'critical' }],
      tribes: [
        {
          tribe: { daoId: 'a', name: 'a', slug: null, status: 'operational', contracts: {} as never },
          state: 'error',
          error: 'x'
        }
      ],
      pendingManagerUpgrade: '0.5.0 can apply soon.'
    });
    expect(items.map((i) => i.id)).toEqual([
      'storage-code',
      'tribes-unread',
      'factory-paused',
      'manager-upgrade',
      'pending-admin'
    ]);
    expect(items[0]).toMatchObject({ tone: 'danger', title: 'Shared contract code: renew now', section: 'storage' });
  });
});
