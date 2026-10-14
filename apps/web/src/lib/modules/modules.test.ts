import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Networks, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getProposalActionResourceKey, isHighRiskProposalAction } from '@/lib/proposal-action-identity';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { buildProposalCallVectors, encodeProposalCallArgs, getProposalActionSummary } from '@/lib/proposal-call';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import {
  holdsWithoutVotes,
  kindFromSpecTag,
  type ModuleKind,
  specArg,
  specValue,
  UNLIMITED_ALLOWANCE,
  validateModuleConfig
} from './kinds';
import { actionCount, buildAttachPlan, buildDetachPlan, type PlanStep } from './plans';
import { type ModuleFacts, moduleReadiness } from './readiness';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const ASSET = contract(9);
const PREDICTED = contract(10);
const config = {
  name: 'testnet',
  slug: 'lantern-club',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  adminAddress: contract(3),
  auctionContractId: '',
  marketplaceContractId: '',
  metadataContractId: contract(6),
  claimsContractId: contract(7)
} as DaoNetworkConfig;
const manager = getDeploymentConfig().managerAddress;
const market = { paymentAsset: ASSET, feeBps: '250' };
const auction = { paymentAsset: ASSET, reservePrice: '10000000', duration: '86400', timeBuffer: '300' };
const claims = { paymentAsset: ASSET };

/** Run a plan the way the composer and the proposal page do: handlers, then call vectors, then encoding. */
function run(steps: PlanStep[], pending?: Record<string, ModuleKind>) {
  const form = { config, session: { address: null, kit: null } };
  const actions = steps.map((step) => {
    const handler = getActionHandler(step.type);
    const check = handler.validate(step.values, form as never);
    if (!check.valid) throw new Error(`${step.type}: ${check.message}`);
    return handler.serialize(step.values, form as never);
  });
  const vectors = buildProposalCallVectors(actions, config.tokenContractId, config.treasuryContractId, config);
  const encoded = encodeProposalCallArgs(vectors.targets, vectors.functions, vectors.args, {
    ...config,
    ...(pending ? { pendingModules: pending } : {})
  });
  return { actions, vectors, encoded };
}

describe('module configs', () => {
  it('holds the contract bounds', () => {
    expect(validateModuleConfig('marketplace', market)).toBeNull();
    expect(validateModuleConfig('marketplace', { ...market, feeBps: '2501' })).toMatch(/at most 25%/);
    expect(validateModuleConfig('auction', auction)).toBeNull();
    expect(validateModuleConfig('auction', { ...auction, duration: '299' })).toMatch(/between 5 minutes and 30 days/);
    expect(validateModuleConfig('auction', { ...auction, timeBuffer: '0' })).toMatch(/late-bid extension/);
    expect(validateModuleConfig('auction', { ...auction, reservePrice: '10' })).toMatch(/too low/);
    expect(validateModuleConfig('claims', { paymentAsset: 'not an asset' })).toMatch(/asset/);
  });

  it('names the union the way the contract does, and follows its non-voting rule', () => {
    expect(kindFromSpecTag('Marketplace')).toBe('marketplace');
    expect(kindFromSpecTag('Circle')).toBeNull();
    expect(holdsWithoutVotes('auction')).toBe(true);
    expect(holdsWithoutVotes('marketplace')).toBe(true);
    expect(holdsWithoutVotes('claims')).toBe(false);
    expect(specArg('marketplace', market)).toEqual(['Marketplace', { payment_asset: ASSET, secondary_fee_bps: 250 }]);
    expect(specValue('claims', claims)).toEqual({ tag: 'Claims', values: [{ payment_asset: ASSET }] });
  });
});

describe('attach plans', () => {
  it('lists the steps of each kind in the order the contracts need', () => {
    const types = (kind: ModuleKind, cfg: never, open: boolean) =>
      buildAttachPlan({ kind, config: cfg, moduleNumber: 0, predicted: PREDICTED, open }).map((s) => s.type);
    expect(types('marketplace', market as never, true)).toEqual(['create-module', 'register-module', 'open-module']);
    expect(types('marketplace', market as never, false)).toEqual(['create-module', 'register-module']);
    expect(types('auction', auction as never, true)).toEqual([
      'create-module',
      'register-module',
      'change-mint-allowance',
      'open-module'
    ]);
    // An auction still gets its allowance when it is left closed, so a later vote only has to open it.
    expect(types('auction', auction as never, false)).toEqual([
      'create-module',
      'register-module',
      'change-mint-allowance'
    ]);
    // A claims module never opens by itself: lists open from Manage → Claims.
    expect(types('claims', claims as never, true)).toEqual(['create-module', 'register-module']);
  });

  it('shows the address first and counts actions in words', () => {
    const steps = buildAttachPlan({
      kind: 'marketplace',
      config: market,
      moduleNumber: 3,
      predicted: PREDICTED,
      open: true
    });
    expect(steps[0]).toMatchObject({ detail: 'It will live at', address: PREDICTED });
    expect(steps[0]!.values).toMatchObject({ moduleNumber: '3', address: PREDICTED });
    expect(actionCount(steps)).toBe('3 actions');
    expect(actionCount(steps.slice(0, 1))).toBe('1 action');
  });

  it('registers claims with votes counted and the auction and market without', () => {
    const register = (kind: ModuleKind, cfg: never) =>
      buildAttachPlan({ kind, config: cfg, moduleNumber: 0, predicted: PREDICTED, open: false }).find(
        (s) => s.type === 'register-module'
      )!.values.nonVoting;
    expect(register('claims', claims as never)).toBe(false);
    expect(register('marketplace', market as never)).toBe(true);
    expect(register('auction', auction as never)).toBe(true);
  });

  it('gives the auction an allowance that never runs out', () => {
    const step = buildAttachPlan({
      kind: 'auction',
      config: auction,
      moduleNumber: 0,
      predicted: PREDICTED,
      open: true
    }).find((s) => s.type === 'change-mint-allowance')!;
    expect(step.values).toEqual({ module: PREDICTED, amount: String(UNLIMITED_ALLOWANCE), direction: 'increase' });
  });
});

describe('detach plans', () => {
  it('closes and sweeps only the pools that need it, then removes the module', () => {
    const steps = buildDetachPlan({
      kind: 'marketplace',
      address: PREDICTED,
      pools: [
        { id: '0', open: true, inStock: 3 },
        { id: '1', open: false, inStock: 2 },
        { id: '2', open: false, inStock: 0 }
      ]
    });
    expect(steps.map((s) => `${s.type}${s.values.poolId ? `:${s.values.poolId}` : ''}`)).toEqual([
      'close-pool:0',
      'sweep-pool:0',
      'sweep-pool:1',
      'unregister-module'
    ]);
  });

  it('pauses before cancelling a running auction, and only when asked', () => {
    expect(buildDetachPlan({ kind: 'auction', address: PREDICTED, cancelAuction: true }).map((s) => s.type)).toEqual([
      'pause-auction',
      'cancel-auction',
      'unregister-module'
    ]);
    expect(buildDetachPlan({ kind: 'auction', address: PREDICTED }).map((s) => s.type)).toEqual(['unregister-module']);
    expect(buildDetachPlan({ kind: 'claims', address: PREDICTED, cancelAuction: true }).map((s) => s.type)).toEqual([
      'unregister-module'
    ]);
  });
});

describe('removal checklist', () => {
  const base: ModuleFacts = {
    kind: 'claims',
    allowance: 2,
    balance: 0,
    votes: 0n,
    transferAgent: false,
    pools: [],
    openListings: 0,
    auctionRunning: false,
    openLists: 0
  };

  it('is two green rows when nothing is in the way', () => {
    const rows = moduleReadiness(base);
    expect(rows.map((r) => [r.id, r.tone])).toEqual([
      ['allowance', 'ok'],
      ['agent', 'ok']
    ]);
  });

  it('warns about what a market leaves behind, and offers the pool clean-up', () => {
    const rows = moduleReadiness({
      ...base,
      kind: 'marketplace',
      pools: [{ id: '0', open: true, inStock: 3 }],
      openListings: 2,
      transferAgent: true
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.holds).toMatchObject({ tone: 'warn', cleanup: 'pools' });
    expect(byId.holds!.title).toBe('Holds 3 memberships in 1 pool');
    expect(byId.listings!.title).toBe('2 resale listings are open');
    expect(byId.agent!.title).toBe('Can move memberships');
  });

  it('offers to cancel a running auction, and says what open claim lists mean', () => {
    expect(
      moduleReadiness({ ...base, kind: 'auction', auctionRunning: true }).find((r) => r.id === 'auction')
    ).toMatchObject({
      tone: 'warn',
      cleanup: 'auction'
    });
    const lists = moduleReadiness({ ...base, openLists: 1 }).find((r) => r.id === 'lists')!;
    expect(lists.title).toBe('1 claim list is open');
    expect(lists.cleanup).toBeUndefined();
  });

  it('never invents a warning for facts it could not read', () => {
    const rows = moduleReadiness({ ...base, kind: 'marketplace', openListings: null });
    expect(rows.some((r) => r.id === 'listings')).toBe(false);
  });

  it('says "no limit" for an auction allowance', () => {
    expect(moduleReadiness({ ...base, kind: 'auction', allowance: UNLIMITED_ALLOWANCE })[0]!.detail).toMatch(
      /no limit/
    );
  });
});

describe('the attach batch as a proposal', () => {
  const steps = buildAttachPlan({
    kind: 'marketplace',
    config: market,
    moduleNumber: 0,
    predicted: PREDICTED,
    open: true
  });

  it('builds the calls in order, against the Manager, the Token, then the new module', () => {
    const { vectors } = run(steps, { [PREDICTED]: 'marketplace' });
    expect(vectors.targets).toEqual([manager, config.tokenContractId, PREDICTED]);
    expect(vectors.functions).toEqual(['create_module', 'register_module', 'unpause']);
    expect(vectors.args[0]).toEqual([
      config.tokenContractId,
      ['Marketplace', { payment_asset: ASSET, secondary_fee_bps: 250 }],
      0
    ]);
    expect(vectors.args[1]).toEqual(['marketplace', PREDICTED, true]);
  });

  it('encodes create_module exactly as the Manager spec encodes it', () => {
    const { encoded } = run(steps, { [PREDICTED]: 'marketplace' });
    const spec = new ManagerClient({ contractId: manager, rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase })
      .spec;
    const expected = spec.funcArgsToScVals('create_module', {
      token: config.tokenContractId,
      spec: specValue('marketplace', market),
      expected_n: 0
    });
    expect(encoded[0]!.map((a) => a.toXDR('base64'))).toEqual(expected.map((a) => a.toXDR('base64')));
  });

  it('reads the union back from the indexer’s array form and from { tag, values }', () => {
    const viaArray = encodeSupportedCall(
      manager,
      'create_module',
      [
        config.tokenContractId,
        ['Auction', { duration: '86400', reserve_price: '10000000', time_buffer: '300', payment_asset: ASSET }],
        1
      ],
      config
    );
    const viaObject = encodeSupportedCall(
      manager,
      'create_module',
      [
        config.tokenContractId,
        {
          tag: 'Auction',
          values: [{ duration: '86400', reserve_price: '10000000', time_buffer: '300', payment_asset: ASSET }]
        },
        1
      ],
      config
    );
    expect(viaArray.map((a) => a.toXDR('base64'))).toEqual(viaObject.map((a) => a.toXDR('base64')));
  });

  it('refuses a module call unless this proposal creates that module', () => {
    expect(() => run(steps)).toThrow(/Unsupported external call/);
    // A different address than the one the proposal predicted is refused too.
    expect(() => run(steps, { [contract(11)]: 'marketplace' })).toThrow(/Unsupported external call/);
  });

  it('refuses a module added to some other DAO, and an unknown union case', () => {
    expect(() =>
      encodeSupportedCall(manager, 'create_module', [contract(99), ['Claims', { payment_asset: ASSET }], 0], config)
    ).toThrow(/this DAO/);
    expect(() =>
      encodeSupportedCall(manager, 'create_module', [config.tokenContractId, ['Circle', {}], 0], config)
    ).toThrow(/Unknown ModuleSpec case/);
  });

  it('refuses a second module of a kind the tribe already has', () => {
    const handler = getActionHandler('create-module');
    const result = handler.validate(
      {
        kind: 'claims',
        moduleNumber: '1',
        address: PREDICTED,
        paymentAsset: ASSET,
        reservePrice: '',
        duration: '',
        timeBuffer: '',
        feeBps: ''
      },
      { config, session: { address: null, kit: null } } as never
    );
    expect(result).toMatchObject({ valid: false });
  });

  it('encodes the whole detach batch too, with no pending module needed', () => {
    const detach = buildDetachPlan({ kind: 'claims', address: contract(7) });
    const { vectors, encoded } = run(detach);
    expect(vectors.functions).toEqual(['unregister_module']);
    expect(encoded).toHaveLength(1);
  });

  it('flags the actions as high risk and reads them back in plain words', () => {
    const { actions } = run(steps, { [PREDICTED]: 'marketplace' });
    expect(getProposalActionResourceKey(actions[0]!)).toBe('manager:module:marketplace:0');
    expect(actions.every((a) => isHighRiskProposalAction(a))).toBe(true);
    expect(getProposalActionSummary(actions[0]!)).toMatch(/^Deploy the market as module number 0, at /);
    expect(getProposalActionSummary(actions[1]!)).toMatch(/holds memberships without votes/);
    expect(getProposalActionSummary(actions[2]!)).toMatch(/^Open the market/);
    const removal = run(buildDetachPlan({ kind: 'claims', address: contract(7) })).actions[0]!;
    expect(getProposalActionSummary(removal)).toMatch(/mint allowance is cleared/);
    // Registering and removing one contract in one proposal is a conflict.
    expect(getProposalActionResourceKey(removal)).toBe(`token:module:${contract(7)}`);
    expect(isHighRiskProposalAction(removal)).toBe(true);
  });
});
