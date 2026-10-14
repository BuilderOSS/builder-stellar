/**
 * The modules a tribe can add after it exists (docs/designs/module-attach-ui.md): the three the
 * Manager deploys from a registered release. Custom contracts are not offered here.
 */
import { StrKey } from '@stellar/stellar-sdk';

import { MIN_RESERVE_PRICE_STROOPS } from '@/lib/auction-values';
import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';

export const MODULE_KINDS = ['auction', 'marketplace', 'claims'] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

/** The Token's registry holds at most this many modules (common::modules::MAX_MODULES). */
export const MAX_MODULES = 16;
/** The Auction mints one token per auction, so it gets an allowance nobody will use up. */
export const UNLIMITED_ALLOWANCE = 0xffffffff;

export function isModuleKind(value: unknown): value is ModuleKind {
  return typeof value === 'string' && (MODULE_KINDS as readonly string[]).includes(value);
}

/** The variant name `ModuleSpec` uses on chain for each kind. */
export const SPEC_TAG: Record<ModuleKind, 'Auction' | 'Marketplace' | 'Claims'> = {
  auction: 'Auction',
  marketplace: 'Marketplace',
  claims: 'Claims'
};

export function kindFromSpecTag(tag: unknown): ModuleKind | null {
  return MODULE_KINDS.find((kind) => SPEC_TAG[kind] === tag) ?? null;
}

/**
 * Whether the Token counts the module's holdings as votes (common::modules::builtin_non_voting):
 * the Auction and the Marketplace hold memberships in custody, the ClaimMinter holds none.
 */
export function holdsWithoutVotes(kind: ModuleKind) {
  return kind !== 'claims';
}

export const MODULE_COPY: Record<
  ModuleKind,
  {
    /** The tile title. */
    title: string;
    /** What it lets the tribe do, in plain words. */
    goal: string;
    /** The module's own name, one line beneath. */
    term: string;
    /** The module in a sentence: "the auction", "the market". */
    noun: string;
    /** The name on a row in the Modules card. */
    rowLabel: string;
  }
> = {
  auction: {
    title: 'Daily auction',
    goal: 'A new membership goes to the highest bidder, over and over.',
    term: 'Auction module · one token per auction, paid to the treasury',
    noun: 'the auction',
    rowLabel: 'Auction'
  },
  marketplace: {
    title: 'Market',
    goal: 'Members resell memberships, and the tribe sells new ones at a fixed price.',
    term: 'Marketplace module · resale listings and quick-buy pools',
    noun: 'the market',
    rowLabel: 'Market'
  },
  claims: {
    title: 'Invite lists',
    goal: 'Hand out memberships to a list of wallets, free or for a price.',
    term: 'Claims module · lists published for anyone to check',
    noun: 'the claims module',
    rowLabel: 'Claims'
  }
};

/** What each kind's creation config needs. Amounts are in the payment asset's smallest unit. */
export type AuctionModuleConfig = { paymentAsset: string; reservePrice: string; duration: string; timeBuffer: string };
export type MarketModuleConfig = { paymentAsset: string; feeBps: string };
export type ClaimsModuleConfig = { paymentAsset: string };
export type ModuleConfigs = {
  auction: AuctionModuleConfig;
  marketplace: MarketModuleConfig;
  claims: ClaimsModuleConfig;
};

const WHOLE = /^(0|[1-9]\d{0,18})$/;

/** The first problem with a kind's creation config, in the contract's own bounds; null when it is fine. */
export function validateModuleConfig<K extends ModuleKind>(kind: K, config: ModuleConfigs[K]): string | null {
  const asset = (config as { paymentAsset: string }).paymentAsset;
  if (!StrKey.isValidContract(asset)) return 'Choose the asset it is priced in.';
  if (kind === 'auction') {
    const c = config as AuctionModuleConfig;
    if (!WHOLE.test(c.reservePrice) || BigInt(c.reservePrice) < MIN_RESERVE_PRICE_STROOPS)
      return 'The starting price is too low.';
    if (!WHOLE.test(c.duration) || Number(c.duration) < 300 || Number(c.duration) > 2_592_000)
      return 'Each auction has to run between 5 minutes and 30 days.';
    if (!WHOLE.test(c.timeBuffer) || Number(c.timeBuffer) < 1 || Number(c.timeBuffer) > 86_400)
      return 'The late-bid extension has to be between 1 second and 1 day.';
  }
  if (kind === 'marketplace') {
    const c = config as MarketModuleConfig;
    if (!/^\d{1,4}$/.test(c.feeBps) || Number(c.feeBps) > MAX_MARKETPLACE_FEE_BPS)
      return 'The resale fee can be at most 25%.';
  }
  return null;
}

/**
 * The `ModuleSpec` as proposal-call arguments: the same array form the indexer returns for the
 * union (`['Marketplace', { … }]`), so a proposal reads back identically.
 */
export function specArg<K extends ModuleKind>(
  kind: K,
  config: ModuleConfigs[K]
): [string, Record<string, string | number>] {
  if (kind === 'auction') {
    const c = config as AuctionModuleConfig;
    return [
      SPEC_TAG.auction,
      { duration: c.duration, reserve_price: c.reservePrice, time_buffer: c.timeBuffer, payment_asset: c.paymentAsset }
    ];
  }
  if (kind === 'marketplace') {
    const c = config as MarketModuleConfig;
    return [SPEC_TAG.marketplace, { payment_asset: c.paymentAsset, secondary_fee_bps: Number(c.feeBps) }];
  }
  return [SPEC_TAG.claims, { payment_asset: (config as ClaimsModuleConfig).paymentAsset }];
}

/** The `ModuleSpec` as the Manager bindings take it, for the launch admin's direct call in Setup. */
export function specValue<K extends ModuleKind>(kind: K, config: ModuleConfigs[K]) {
  if (kind === 'auction') {
    const c = config as AuctionModuleConfig;
    return {
      tag: 'Auction' as const,
      values: [
        {
          duration: BigInt(c.duration),
          reserve_price: BigInt(c.reservePrice),
          time_buffer: BigInt(c.timeBuffer),
          payment_asset: c.paymentAsset
        }
      ] as const
    };
  }
  if (kind === 'marketplace') {
    const c = config as MarketModuleConfig;
    return {
      tag: 'Marketplace' as const,
      values: [{ payment_asset: c.paymentAsset, secondary_fee_bps: Number(c.feeBps) }] as const
    };
  }
  return { tag: 'Claims' as const, values: [{ payment_asset: (config as ClaimsModuleConfig).paymentAsset }] as const };
}

/** Why the Add sheet cannot offer a kind right now, in words; null when it can. */
export function attachAvailability(kind: ModuleKind, present: ReadonlySet<ModuleKind>, registered: number) {
  if (registered >= MAX_MODULES) return 'This tribe already has the most modules it can hold.';
  if (present.has(kind)) return 'This tribe already has one. Remove it first to replace it.';
  return null;
}
