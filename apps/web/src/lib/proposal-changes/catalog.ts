import type { ComponentType } from 'react';

import type { AdminValueDraft } from '@/components/admin/admin-action-forms';
import {
  durationSettingForm,
  QuorumSettingForm,
  StartingPriceSettingForm,
  wholeNumberSettingForm
} from '@/components/proposal-changes/setting-forms';
import type { GovernorSettings } from '@/lib/admin-queries';
import type { AuctionStatus } from '@/lib/auction-status';
import { formatStroops } from '@/lib/auction-values';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { formatDuration } from '@/lib/duration';
import { feePercentText } from '@/lib/marketplace/amount';
import type { MarketplaceConfig } from '@/lib/marketplace/types';
import type { MembershipState } from '@/lib/membership-state';
import { getActionHandler, getAllActionHandlers } from '@/lib/proposal-actions/registry';
import type { ActionFormProps, ActionHandler, ProposalActionType } from '@/lib/proposal-actions/types';

import { CHANGE_SOURCES, type ChangeSourceKey, defaultSourceKey } from './change-request';

/** The tribe's live settings the composer and Manage pages read, whichever have loaded. */
export type SettingValues = {
  governor?: GovernorSettings;
  auction?: AuctionStatus & { assetCode?: string };
  membership?: MembershipState;
  marketplace?: MarketplaceConfig | null;
};

/** Where an action sits in the picker. "Elsewhere" actions are prepared on their own page and never picked. */
export type PickerSection = 'intent' | 'setting' | 'advanced' | 'elsewhere';

/** The tribe's parts, as the Manage navigation groups them. */
export type TribePart = 'Tribe' | 'Membership' | 'Rules' | 'Selling' | 'Treasury' | 'System';
export const TRIBE_PARTS: TribePart[] = ['Tribe', 'Membership', 'Rules', 'Selling', 'Treasury', 'System'];

/** A setting's live value, in the form's own draft so an edit starts from it, and in words. */
export type CurrentValue<TData = unknown> = { draft: TData; text: string };

export type ActionMeta = {
  section: PickerSection;
  part: TribePart;
  /** "Do something" tiles: what the member wants, in their words. */
  intent?: string;
  /** The live value, when it can be read. */
  currentValue?: (values: SettingValues) => CurrentValue | null;
  /** The setting's own form, shared by the composer and its Manage page. Defaults to the handler's. */
  Form?: ComponentType<ActionFormProps<any>>;
  /** Pickers search these as well as the label. */
  keywords?: string;
};

/** Why an action can't be picked for this tribe, and where to fix it. */
export type Availability =
  { available: true } | { available: false; reason: string; fixHref?: string; fixLabel?: string };

const long = (seconds: number) => formatDuration(seconds, { style: 'long' });

function governorValue(
  read: (governor: GovernorSettings) => number | bigint | undefined,
  format: (v: number) => string
) {
  return (values: SettingValues): CurrentValue<AdminValueDraft> | null => {
    const value = values.governor ? read(values.governor) : undefined;
    if (value === undefined) return null;
    return { draft: { value: String(value) }, text: format(Number(value)) };
  };
}

function auctionValue(read: (auction: AuctionStatus) => string | number, format: (value: string) => string) {
  return (values: SettingValues): CurrentValue<AdminValueDraft> | null => {
    if (!values.auction) return null;
    const value = String(read(values.auction));
    return { draft: { value }, text: format(value) };
  };
}

function switchValue(key: keyof MembershipState['settings']) {
  return (values: SettingValues): CurrentValue<{ enabled: boolean }> | null => {
    const enabled = values.membership?.settings[key];
    return enabled === undefined ? null : { draft: { enabled: !enabled }, text: enabled ? 'On' : 'Off' };
  };
}

const pausedText = (paused: boolean | undefined) => (paused === undefined ? null : paused ? 'Paused' : 'Running');

/** Picker metadata for every registered action, keyed by type. Handlers keep their call logic; this says where they go. */
export const ACTION_CATALOG: Record<ProposalActionType, ActionMeta> = {
  // Do something
  'transfer-sac-token': {
    section: 'intent',
    part: 'Treasury',
    intent: 'Pay someone',
    keywords: 'send funds xlm usdc payout'
  },
  'batch-mint-governance-token': {
    section: 'intent',
    part: 'Membership',
    intent: 'Add members',
    keywords: 'mint tokens'
  },
  'mint-governance-token': { section: 'intent', part: 'Membership', intent: 'Add one member', keywords: 'mint token' },
  'transfer-dao-token': {
    section: 'intent',
    part: 'Treasury',
    intent: 'Give a treasury token',
    keywords: 'membership nft'
  },
  'dao-transfer': {
    section: 'intent',
    part: 'Membership',
    intent: 'Recover a membership',
    keywords: 'lost key move token'
  },
  'treasury-buy-listing': {
    section: 'elsewhere',
    part: 'Treasury',
    intent: 'Buy a listing',
    keywords: 'market purchase'
  },

  // Change a setting
  'set-token-metadata': { section: 'setting', part: 'Tribe', keywords: 'name symbol' },
  'change-dao-slug': { section: 'elsewhere', part: 'Tribe', keywords: 'link url' },
  'update-dao-profile': { section: 'elsewhere', part: 'Tribe', keywords: 'description image links' },
  'set-transfers-locked': {
    section: 'setting',
    part: 'Membership',
    currentValue: switchValue('transfersLocked'),
    keywords: 'lock sell transfer'
  },
  'set-members-only-delegation': {
    section: 'setting',
    part: 'Membership',
    currentValue: switchValue('membersOnlyDelegation'),
    keywords: 'delegate'
  },
  'set-dao-recovery': {
    section: 'setting',
    part: 'Membership',
    currentValue: switchValue('daoRecovery'),
    keywords: 'recover'
  },
  'change-mint-allowance': { section: 'setting', part: 'Membership', keywords: 'module mint allowance' },
  'add-artwork-properties': { section: 'elsewhere', part: 'Membership', keywords: 'artwork layers' },
  'set-artwork-renderer': { section: 'elsewhere', part: 'Membership', keywords: 'artwork renderer images' },
  'regenerate-token-traits': { section: 'elsewhere', part: 'Membership', keywords: 'seed traits' },
  'open-claim-list': { section: 'elsewhere', part: 'Membership', keywords: 'claims allowlist' },
  'set-voting-delay': {
    section: 'setting',
    part: 'Rules',
    currentValue: governorValue((g) => g.votingDelay, long),
    Form: durationSettingForm({
      id: 'setting-voting-delay',
      label: 'Wait before voting opens',
      helper: 'Between 5 minutes and 30 days. A day gives members time to read it.'
    }),
    keywords: 'voting delay'
  },
  'set-voting-period': {
    section: 'setting',
    part: 'Rules',
    currentValue: governorValue((g) => g.votingPeriod, long),
    Form: durationSettingForm({
      id: 'setting-voting-period',
      label: 'Voting stays open for',
      helper: 'Between 5 minutes and 30 days. 3 to 7 days is common.'
    }),
    keywords: 'voting period'
  },
  'set-queue-delay': {
    section: 'setting',
    part: 'Rules',
    currentValue: governorValue((g) => g.queueDelay, long),
    Form: durationSettingForm({
      id: 'setting-queue-delay',
      label: 'Safety delay',
      helper: 'How long a passed proposal waits after it’s queued before it can run. Between 5 minutes and 30 days.'
    }),
    keywords: 'queue timelock'
  },
  'set-proposal-threshold': {
    section: 'setting',
    part: 'Rules',
    currentValue: governorValue(
      (g) => g.proposalThreshold,
      (votes) => `${votes} ${votes === 1 ? 'vote' : 'votes'}`
    ),
    Form: wholeNumberSettingForm({
      id: 'setting-proposal-threshold',
      label: 'Votes needed to propose',
      helper: 'How many votes someone needs to make a proposal. At least 1; higher numbers cut down on spam.'
    }),
    keywords: 'threshold propose'
  },
  'set-quorum-bps': {
    section: 'setting',
    part: 'Rules',
    currentValue: governorValue(
      (g) => g.quorumBps,
      (bps) => `${bps / 100}%`
    ),
    Form: QuorumSettingForm,
    keywords: 'quorum'
  },
  'pause-auction': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) => {
      const text = pausedText(values.auction?.paused);
      return text ? { draft: {}, text } : null;
    }
  },
  'unpause-auction': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) => {
      const text = pausedText(values.auction?.paused);
      return text ? { draft: {}, text } : null;
    },
    keywords: 'resume start'
  },
  'set-auction-reserve-price': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) => {
      if (!values.auction) return null;
      const price = formatStroops(values.auction.config.reserve_price);
      const assetCode = values.auction.assetCode;
      const unit = assetCode ? ` ${assetCode}` : '';
      return { draft: { reservePrice: price, ...(assetCode ? { assetCode } : {}) }, text: `${price}${unit}` };
    },
    Form: StartingPriceSettingForm,
    keywords: 'starting price reserve'
  },
  'set-auction-duration': {
    section: 'setting',
    part: 'Selling',
    currentValue: auctionValue(
      (a) => a.config.duration,
      (seconds) => long(Number(seconds))
    ),
    Form: durationSettingForm({
      id: 'setting-auction-duration',
      label: 'Each auction runs for',
      helper: 'Between 5 minutes and 30 days.',
      showSeconds: false
    }),
    keywords: 'auction length'
  },
  'set-auction-time-buffer': {
    section: 'setting',
    part: 'Selling',
    currentValue: auctionValue(
      (a) => a.config.time_buffer,
      (seconds) => long(Number(seconds))
    ),
    Form: durationSettingForm({
      id: 'setting-auction-time-buffer',
      label: 'A late bid adds',
      helper: 'Up to 1 day. Bids near the end extend the auction so everyone gets a fair chance.'
    }),
    keywords: 'time buffer extension'
  },
  'set-auction-min-bid-increment': {
    section: 'setting',
    part: 'Selling',
    currentValue: auctionValue(
      (a) => a.config.min_bid_increment_percent,
      (percent) => `${percent}%`
    ),
    Form: wholeNumberSettingForm({
      id: 'setting-auction-min-bid',
      label: 'Minimum bid increase (%)',
      helper: 'Each new bid must be this much higher than the last, from 1 to 100.'
    }),
    keywords: 'increment'
  },
  'set-auction-payment-token': { section: 'advanced', part: 'Selling', keywords: 'auction asset' },
  'cancel-auction': { section: 'setting', part: 'Selling', keywords: 'refund' },
  'set-marketplace-payment-token': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) =>
      values.marketplace
        ? { draft: { paymentToken: values.marketplace.paymentAsset }, text: values.marketplace.paymentAsset }
        : null,
    keywords: 'market asset'
  },
  'set-marketplace-secondary-fee': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) =>
      values.marketplace
        ? {
            draft: { value: feePercentText(values.marketplace.feeBps) },
            text: `${feePercentText(values.marketplace.feeBps)}%`
          }
        : null,
    keywords: 'resale fee royalty'
  },
  'pause-marketplace': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) => {
      const text = pausedText(values.marketplace?.paused);
      return text ? { draft: {}, text: text === 'Running' ? 'Open' : text } : null;
    }
  },
  'unpause-marketplace': {
    section: 'setting',
    part: 'Selling',
    currentValue: (values) => {
      const text = pausedText(values.marketplace?.paused);
      return text ? { draft: {}, text: text === 'Running' ? 'Open' : text } : null;
    },
    keywords: 'reopen market'
  },
  'open-pool': { section: 'elsewhere', part: 'Selling', keywords: 'quick buy pool' },
  'close-pool': { section: 'setting', part: 'Selling', keywords: 'pool' },
  'sweep-pool': { section: 'setting', part: 'Selling', keywords: 'pool unsold' },

  // Advanced
  'upgrade-dao-module': { section: 'elsewhere', part: 'System', keywords: 'upgrade release contract' },
  'set-transfer-agent': { section: 'advanced', part: 'Membership', keywords: 'agent module' },
  'approved-transfer': { section: 'advanced', part: 'Membership', keywords: 'approve move token' },

  // Prepared on their own page
  'migrate-dao-module': { section: 'elsewhere', part: 'System' },
  'treasury-authorize': { section: 'elsewhere', part: 'Treasury' },
  'create-module': { section: 'elsewhere', part: 'Membership' },
  'register-module': { section: 'elsewhere', part: 'Membership' },
  'unregister-module': { section: 'elsewhere', part: 'Membership' },
  'open-module': { section: 'elsewhere', part: 'Selling' }
};

export function getActionMeta(type: ProposalActionType): ActionMeta {
  return ACTION_CATALOG[type];
}

/** The form a setting is edited with, the same in the composer and on its Manage page. */
export function settingForm(type: ProposalActionType): ComponentType<ActionFormProps<any>> {
  return ACTION_CATALOG[type]?.Form ?? getActionHandler(type).FormComponent;
}

/** The page an action is made on, for its "Open in Manage" link and its source chip. */
export function actionHome(type: ProposalActionType) {
  return CHANGE_SOURCES[defaultSourceKey(type)];
}

/** Can this action be picked in the composer at all, as opposed to made on its own page? */
export function isPickable(handler: ActionHandler) {
  return handler.pickable !== false && ACTION_CATALOG[handler.type]?.section !== 'elsewhere';
}

const AUCTION_TYPES = new Set<ProposalActionType>([
  'pause-auction',
  'unpause-auction',
  'set-auction-reserve-price',
  'set-auction-duration',
  'set-auction-time-buffer',
  'set-auction-min-bid-increment',
  'set-auction-payment-token',
  'cancel-auction'
]);
const MARKET_TYPES = new Set<ProposalActionType>([
  'set-marketplace-payment-token',
  'set-marketplace-secondary-fee',
  'pause-marketplace',
  'unpause-marketplace',
  'open-pool',
  'close-pool',
  'sweep-pool',
  'treasury-buy-listing'
]);

const MODULE_FIX: Pick<Availability & { available: false }, 'fixHref' | 'fixLabel'> = {
  fixHref: CHANGE_SOURCES.membership.href,
  fixLabel: CHANGE_SOURCES.membership.label
};

/** Whether this tribe can run the action, and if not, why and where to fix it. Unknown state never blocks. */
export function actionAvailability(
  type: ProposalActionType,
  config: DaoNetworkConfig,
  values: SettingValues
): Availability {
  if (AUCTION_TYPES.has(type) && !config.auctionContractId)
    return { available: false, reason: 'This tribe has no auction yet.', ...MODULE_FIX };
  if (MARKET_TYPES.has(type) && !config.marketplaceContractId)
    return { available: false, reason: 'This tribe has no market yet.', ...MODULE_FIX };
  if (type === 'open-claim-list' && !config.claimsContractId)
    return { available: false, reason: 'This tribe has no claims module yet.', ...MODULE_FIX };
  if (type === 'dao-transfer' && values.membership && !values.membership.settings.daoRecovery)
    return {
      available: false,
      reason: 'DAO recovery is off. Turn it on first, in this proposal or an earlier one.',
      fixHref: CHANGE_SOURCES.membership.href,
      fixLabel: CHANGE_SOURCES.membership.label
    };
  if (type === 'pause-auction' && values.auction?.paused)
    return { available: false, reason: 'Auctions are already paused.' };
  if (type === 'unpause-auction' && values.auction && !values.auction.paused)
    return { available: false, reason: 'Auctions are already running.' };
  if (type === 'pause-marketplace' && values.marketplace?.paused)
    return { available: false, reason: 'The market is already paused.' };
  if (type === 'unpause-marketplace' && values.marketplace && !values.marketplace.paused)
    return { available: false, reason: 'The market is already open.' };
  return { available: true };
}

/** Every pickable action, in its picker section and tribe part. */
export function pickerEntries() {
  return getAllActionHandlers()
    .filter(isPickable)
    .map((handler) => ({ handler, meta: ACTION_CATALOG[handler.type] }));
}

export type { ChangeSourceKey };
