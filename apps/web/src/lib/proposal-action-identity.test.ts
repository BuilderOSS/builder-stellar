import { describe, expect, it } from 'vitest';

import {
  analyzeProposalAction,
  analyzeProposalDraft,
  getProposalActionIdentity,
  isHighRiskProposalAction,
  type ProposalDraftState
} from './proposal-action-identity';
import type { ProposalQueuedAction } from './proposal-actions/types';

const action = (patch: Partial<ProposalQueuedAction>): ProposalQueuedAction => ({
  id: 'test-id',
  type: 'set-voting-delay',
  recipient: '',
  amount: '',
  ...patch
});

describe('proposal action identity', () => {
  it('ignores generated ids and normalizes addresses and numeric strings', () => {
    const first = getProposalActionIdentity(
      action({ id: 'one', type: 'batch-mint-governance-token', recipient: 'gabc', amount: '01' })
    );
    const second = getProposalActionIdentity(
      action({ id: 'two', type: 'batch-mint-governance-token', recipient: ' GABC ', amount: '1' })
    );

    expect(first.key).toBe(second.key);
  });

  it('finds exact duplicates', () => {
    const existing = action({ value: '10' });
    const findings = analyzeProposalAction(action({ id: 'new', value: '10' }), [existing]);

    expect(findings.some((finding) => finding.kind === 'duplicate')).toBe(true);
  });

  it('finds conflicting updates to the same resource', () => {
    const existing = action({ value: '10' });
    const findings = analyzeProposalAction(action({ id: 'new', value: '20' }), [existing]);

    expect(findings.some((finding) => finding.kind === 'conflict')).toBe(true);
  });

  it('allows pause → changes → resume as one ordered proposal', () => {
    const draft = [
      action({ id: 'p', type: 'pause-auction' }),
      action({ id: 'r', type: 'set-auction-reserve-price', reservePrice: '5' })
    ];
    const resume = analyzeProposalAction(action({ id: 'u', type: 'unpause-auction' }), draft);
    expect(resume.some((finding) => finding.severity === 'error')).toBe(false);
    // And pausing again later is a fresh step, not a repeat.
    const again = analyzeProposalAction(action({ id: 'p2', type: 'pause-auction' }), [
      ...draft,
      action({ id: 'u', type: 'unpause-auction' })
    ]);
    expect(again.some((finding) => finding.severity === 'error')).toBe(false);
  });

  it('flags the same pause step twice in a row', () => {
    const findings = analyzeProposalAction(action({ id: 'new', type: 'pause-auction' }), [
      action({ type: 'pause-auction' })
    ]);
    expect(findings.some((finding) => finding.kind === 'duplicate')).toBe(true);
  });

  it('warns when an auction setting runs after auctions resume', () => {
    const late = analyzeProposalAction(action({ id: 'd', type: 'set-auction-duration', value: '600' }), [
      action({ id: 'p', type: 'pause-auction' }),
      action({ id: 'u', type: 'unpause-auction' })
    ]);
    expect(late.some((finding) => finding.kind === 'order' && finding.severity === 'warning')).toBe(true);
    const inside = analyzeProposalAction(action({ id: 'd', type: 'set-auction-duration', value: '600' }), [
      action({ id: 'p', type: 'pause-auction' })
    ]);
    expect(inside.some((finding) => finding.kind === 'order')).toBe(false);
  });

  it('uses per-module upgrade resources and exact leading-zero/case-normalized WASM hashes', () => {
    const fromHash = '0'.repeat(63) + '1';
    const toHash = '00' + 'AB'.repeat(31);
    const first = action({ id: 'one', type: 'upgrade-dao-module', module: 'token', fromHash, toHash });
    const same = action({ ...first, id: 'two', toHash: toHash.toLowerCase() });
    expect(getProposalActionIdentity(first).normalizedArgs.fromHash).toBe(fromHash);
    expect(getProposalActionIdentity(first).key).toBe(getProposalActionIdentity(same).key);
    expect(analyzeProposalAction(same, [first]).some((finding) => finding.kind === 'duplicate')).toBe(true);
    expect(
      analyzeProposalAction(action({ ...first, id: 'three', toHash: 'cd'.repeat(32) }), [first]).some(
        (finding) => finding.kind === 'conflict'
      )
    ).toBe(true);
    expect(
      analyzeProposalAction(action({ ...first, id: 'four', module: 'treasury' }), [first]).some(
        (finding) => finding.kind === 'conflict' || finding.kind === 'duplicate'
      )
    ).toBe(false);
    expect(isHighRiskProposalAction(first)).toBe(true);
  });

  it('keeps ordered append occurrences separate, even for repeated identical payloads', () => {
    const first = action({
      id: 'batch1',
      type: 'add-artwork-properties',
      names: ['007'],
      items: [{ name: ' 01 ', property_id: 0, is_new_property: true }],
      ipfsGroup: { base_uri: 'ipfs://collection', extension: '.png' }
    });
    const second = action({ ...first, id: 'batch2' });
    const third = action({
      ...first,
      id: 'batch3',
      items: [{ name: 'Second', property_id: 0, is_new_property: false }]
    });
    expect(getProposalActionIdentity(first).key).not.toBe(getProposalActionIdentity(second).key);
    expect(getProposalActionIdentity(first).normalizedArgs.names).toEqual(['007']);
    expect(getProposalActionIdentity(first).normalizedArgs.items).toEqual([
      { name: ' 01 ', property_id: 0, is_new_property: true }
    ]);
    for (const next of [second, third])
      expect(
        analyzeProposalAction(next, [first]).some(
          (finding) => finding.kind === 'duplicate' || finding.kind === 'conflict'
        )
      ).toBe(false);
    expect(isHighRiskProposalAction(first)).toBe(true);
  });

  it('flags metadata settings/address changes as high risk and distinguishes exact string values', () => {
    const renderer = action({ type: 'set-artwork-renderer', value: 'https://a.test/007' });
    const other = action({ ...renderer, id: 'other', value: 'https://a.test/7' });
    expect(getProposalActionIdentity(renderer).key).not.toBe(getProposalActionIdentity(other).key);
    expect(analyzeProposalAction(other, [renderer]).some((finding) => finding.kind === 'conflict')).toBe(true);
    // Two profile replacements in one proposal race on the same revision.
    const profile = action({ type: 'update-dao-profile', expectedSeq: 2, profile: '{"description":"a"}' });
    const nextProfile = action({ ...profile, id: 'p2', profile: '{"description":"b"}' });
    expect(analyzeProposalAction(nextProfile, [profile]).some((finding) => finding.kind === 'conflict')).toBe(true);
    for (const type of [
      'set-artwork-renderer',
      'update-dao-profile',
      'set-marketplace-payment-token',
      'set-auction-payment-token'
    ] as const)
      expect(isHighRiskProposalAction(action({ type }))).toBe(true);
  });
});

describe('prerequisites and order the contracts enforce', () => {
  const MARKET = 'CMARKET';
  const CLAIMS = 'CCLAIMS';
  const NEW = 'CNEWAUCTION';
  const state: ProposalDraftState = {
    auctionPaused: false,
    tokenSettings: { transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false },
    auctionContractId: 'CAUCTION',
    marketplaceContractId: MARKET,
    claimsContractId: CLAIMS
  };
  const orders = (findings: ReturnType<typeof analyzeProposalAction>) =>
    findings.filter((finding) => finding.kind === 'order');
  const grant = (module: string, direction = 'increase') =>
    action({ id: `grant-${module}`, type: 'change-mint-allowance', module, recipient: module, amount: '5', direction });

  it('asks for a pause before an auction setting or cancel, unless auctions are paused now', () => {
    for (const type of ['set-auction-reserve-price', 'set-auction-payment-token', 'cancel-auction'] as const) {
      const setting = action({ id: 's', type, value: '600' });
      expect(orders(analyzeProposalAction(setting, [], state))[0]).toMatchObject({
        severity: 'warning',
        message: expect.stringContaining('Auctions are running')
      });
      expect(orders(analyzeProposalAction(setting, []))[0]?.message).toContain('unless they are paused already');
      expect(orders(analyzeProposalAction(setting, [action({ type: 'pause-auction' })], state))).toEqual([]);
      expect(orders(analyzeProposalAction(setting, [], { ...state, auctionPaused: true }))).toEqual([]);
    }
  });

  it('asks for a mint allowance before a pool, a claim list or a new auction opens', () => {
    const pool = action({ id: 'pool', type: 'open-pool', size: '5' });
    const list = action({ id: 'list', type: 'open-claim-list', claimsContractId: CLAIMS });
    const auction = action({ id: 'open', type: 'open-module', kind: 'auction', address: NEW });
    for (const [opening, module] of [
      [pool, MARKET],
      [list, CLAIMS],
      [auction, NEW]
    ] as const) {
      expect(orders(analyzeProposalAction(opening, [], state))[0]?.message).toContain('mint allowance');
      expect(orders(analyzeProposalAction(opening, [grant(module, 'decrease')], state))).toHaveLength(1);
      expect(orders(analyzeProposalAction(opening, [grant('COTHER')], state))).toHaveLength(1);
      const register = action({ id: 'r', type: 'register-module', address: module });
      expect(orders(analyzeProposalAction(opening, [register, grant(module)], state))).toEqual([]);
    }
    // Opening a market mints nothing.
    const market = action({ id: 'm', type: 'open-module', kind: 'marketplace', address: NEW });
    expect(orders(analyzeProposalAction(market, [], state))).toEqual([]);
  });

  it('wants an authorization directly before the call it applies to, and an outside call after it', () => {
    const authorize = action({ id: 'auth', type: 'treasury-authorize', nodes: [] });
    const buy = action({ id: 'buy', type: 'treasury-buy-listing', tokenId: '1', maxPrice: '10' });
    expect(orders(analyzeProposalAction(buy, [authorize]))).toEqual([]);
    expect(orders(analyzeProposalAction(buy, []))[0]?.severity).toBe('error');
    expect(orders(analyzeProposalAction(buy, [authorize, action({ id: 'x', type: 'pause-auction' })]))).toHaveLength(1);
    for (const next of [
      action({ id: 'a2', type: 'treasury-authorize', nodes: [] }),
      action({ id: 'up', type: 'upgrade-dao-module', module: 'treasury', fromHash: '01', toHash: '02' }),
      action({ id: 'mig', type: 'migrate-dao-module', module: 'treasury' })
    ])
      expect(orders(analyzeProposalAction(next, [authorize]))[0]).toMatchObject({
        severity: 'error',
        existingActionIndexes: [0]
      });
    const tokenUpgrade = action({
      id: 'up',
      type: 'upgrade-dao-module',
      module: 'token',
      fromHash: '01',
      toHash: '02'
    });
    expect(orders(analyzeProposalAction(tokenUpgrade, [authorize]))).toEqual([]);
    // Nothing after it at all: only the whole draft can tell.
    expect(analyzeProposalDraft([authorize])).toEqual([
      expect.objectContaining({ severity: 'error', kind: 'order', existingActionIndexes: [0] })
    ]);
    expect(orders(analyzeProposalDraft([authorize, buy]))).toEqual([]);
  });

  it('wants a module registered before its allowance or transfer agent changes', () => {
    for (const type of ['change-mint-allowance', 'set-transfer-agent'] as const) {
      const change = action({ id: 'c', type, module: 'CCUSTOM', amount: '1', enabled: true });
      expect(orders(analyzeProposalAction(change, [], state))[0]?.message).toContain('not registered');
      // Without indexed state a custom module may be registered; say nothing.
      expect(orders(analyzeProposalAction(change, []))).toEqual([]);
      const register = action({ id: 'r', type: 'register-module', address: 'CCUSTOM' });
      expect(orders(analyzeProposalAction(change, [register], state))).toEqual([]);
      const known = action({ ...change, module: MARKET });
      expect(orders(analyzeProposalAction(known, [], state))).toEqual([]);
      const removed = action({ id: 'u', type: 'unregister-module', address: MARKET });
      expect(orders(analyzeProposalAction(known, [removed], state))).toHaveLength(1);
    }
  });

  it('wants DAO recovery on before a recovery transfer', () => {
    const recover = action({ id: 'd', type: 'dao-transfer', tokenId: '1', to: 'GNEW' });
    expect(orders(analyzeProposalAction(recover, [], state))[0]?.message).toContain('DAO recovery is off');
    expect(orders(analyzeProposalAction(recover, []))[0]?.message).toContain('unless it is on already');
    const on = action({ id: 'on', type: 'set-dao-recovery', enabled: true });
    const off = action({ id: 'off', type: 'set-dao-recovery', enabled: false });
    expect(orders(analyzeProposalAction(recover, [on], state))).toEqual([]);
    expect(orders(analyzeProposalAction(recover, [on, off], state))[0]?.existingActionIndexes).toEqual([1]);
    const recoveryOn = { ...state, tokenSettings: { ...state.tokenSettings!, daoRecovery: true } };
    expect(orders(analyzeProposalAction(recover, [], recoveryOn))).toEqual([]);
  });

  it('warns when a membership switch is set to the value it already has', () => {
    const lock = action({ id: 'l', type: 'set-transfers-locked', enabled: false });
    expect(orders(analyzeProposalAction(lock, [], state))[0]?.message).toContain('off already');
    expect(orders(analyzeProposalAction({ ...lock, enabled: true }, [], state))).toEqual([]);
    const recovery = action({ id: 'r', type: 'set-dao-recovery', enabled: true });
    const recoveryOn = { ...state, tokenSettings: { ...state.tokenSettings!, daoRecovery: true } };
    expect(orders(analyzeProposalAction(recovery, [], recoveryOn))[0]?.message).toContain('on already');
    expect(orders(analyzeProposalAction(recovery, []))).toEqual([]);
  });

  it('warns when pausing paused auctions or resuming running ones, from the current state', () => {
    const pause = action({ id: 'p', type: 'pause-auction' });
    const resume = action({ id: 'u', type: 'unpause-auction' });
    expect(orders(analyzeProposalAction(pause, [], { auctionPaused: true }))[0]?.message).toContain('paused already');
    expect(orders(analyzeProposalAction(resume, [], { auctionPaused: false }))[0]?.message).toContain(
      'running already'
    );
    expect(orders(analyzeProposalAction(pause, [], { auctionPaused: false }))).toEqual([]);
    expect(orders(analyzeProposalAction(resume, [], { auctionPaused: true }))).toEqual([]);
    expect(orders(analyzeProposalAction(pause, []))).toEqual([]);
    // A step earlier in the draft decides instead of the current state.
    expect(orders(analyzeProposalAction(resume, [pause], { auctionPaused: false }))).toEqual([]);
  });
});
