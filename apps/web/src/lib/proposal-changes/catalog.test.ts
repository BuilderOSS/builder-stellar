import { describe, expect, it } from 'vitest';

import { getActionHandler, getAllActionHandlers } from '@/lib/proposal-actions/registry';
import type { ProposalActionType } from '@/lib/proposal-actions/types';

import {
  ACTION_CATALOG,
  actionAvailability,
  getActionMeta,
  isPickable,
  pickerEntries,
  settingForm,
  type SettingValues
} from './catalog';
import { config } from './test-fixtures';

const values: SettingValues = {
  governor: {
    votingDelay: 86_400,
    votingPeriod: 259_200,
    proposalThreshold: 2n,
    quorumBps: 1000,
    queueDelay: 3600,
    latestLedger: 0,
    source: 'chain'
  },
  auction: {
    status: 'active',
    paused: false,
    auction: null,
    assetCode: 'XLM',
    config: {
      duration: 86_400,
      reserve_price: '10000000',
      time_buffer: 900,
      payment_token: config.tokenContractId,
      min_bid_increment_percent: 10
    }
  },
  membership: {
    admin: config.treasuryContractId,
    live: true,
    settings: { transfersLocked: false, membersOnlyDelegation: true, daoRecovery: false },
    modules: []
  },
  marketplace: { paymentAsset: config.tokenContractId, feeBps: 250, paused: false } as SettingValues['marketplace']
};
const context = { config, session: { address: null, kit: null } };
const call = (type: ProposalActionType, draft: unknown) =>
  getActionHandler(type).buildCallVector(draft, {
    config,
    governorContractId: config.governorContractId,
    tokenContractId: config.tokenContractId,
    treasuryAddress: config.treasuryContractId
  });

describe('action catalog', () => {
  it('places every registered action in the picker or on its own page', () => {
    for (const handler of getAllActionHandlers()) expect(ACTION_CATALOG[handler.type], handler.type).toBeDefined();
  });

  it('never offers actions that are prepared on another page', () => {
    const pickable = pickerEntries().map((entry) => entry.handler.type);
    for (const type of [
      'migrate-dao-module',
      'add-artwork-properties',
      'update-dao-profile',
      'open-claim-list',
      'treasury-authorize',
      'treasury-buy-listing',
      'create-module'
    ] as ProposalActionType[])
      expect(pickable).not.toContain(type);
    expect(pickable).toEqual(expect.arrayContaining(['transfer-sac-token', 'set-quorum-bps', 'set-auction-duration']));
    expect(isPickable({ ...getActionHandler('set-quorum-bps'), pickable: false })).toBe(false);
  });

  it('says why an action is unavailable for this tribe and where to fix it', () => {
    const noAuction = { ...config, auctionContractId: '' };
    expect(actionAvailability('set-auction-duration', noAuction, {})).toMatchObject({
      available: false,
      fixHref: 'admin/owner'
    });
    expect(actionAvailability('dao-transfer', config, values)).toMatchObject({ available: false });
    expect(actionAvailability('dao-transfer', config, {})).toEqual({ available: true });
    expect(actionAvailability('unpause-auction', config, values)).toMatchObject({ available: false });
    expect(actionAvailability('pause-auction', config, values)).toEqual({ available: true });
  });
});

describe('one form per setting', () => {
  const settings = (Object.keys(ACTION_CATALOG) as ProposalActionType[]).filter(
    (type) => ACTION_CATALOG[type].currentValue
  );

  it('reads a current value for every setting that has one', () => {
    for (const type of settings) expect(getActionMeta(type).currentValue!(values), type).not.toBeNull();
    expect(getActionMeta('set-quorum-bps').currentValue!(values)?.text).toBe('10%');
    expect(getActionMeta('set-voting-period').currentValue!(values)?.text).toBe('3 days');
    expect(getActionMeta('set-auction-reserve-price').currentValue!(values)).toEqual({
      draft: { reservePrice: '1', assetCode: 'XLM' },
      text: '1 XLM'
    });
    expect(getActionMeta('set-transfers-locked').currentValue!(values)).toEqual({
      draft: { enabled: true },
      text: 'Off'
    });
  });

  it('encodes a value edited on Manage exactly as the composer does', () => {
    for (const type of settings) {
      const handler = getActionHandler(type);
      const draft = getActionMeta(type).currentValue!(values)!.draft;
      // Manage and the composer render settingForm(type) and serialize through the same handler.
      expect(settingForm(type), type).toBeDefined();
      if (!handler.validate(draft, context).valid) continue;
      const fromManage = handler.serialize(draft, context);
      const fromComposer = handler.serialize(handler.deserialize(fromManage), context);
      const { id: _a, ...manage } = fromManage;
      const { id: _b, ...composer } = fromComposer;
      expect(composer, type).toEqual(manage);
      expect(call(type, handler.deserialize(fromComposer)), type).toEqual(call(type, draft));
    }
  });
});
